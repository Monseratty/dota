import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";

type RequestMethod = "GET" | "PUT" | "DELETE";

export interface S3ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
  uploadPrefix: string;
  directUploadPrefix: string;
  presignedUrlTtlSeconds: number;
}

interface SignedRequest {
  url: URL;
  requestPath: string;
  headers: Record<string, string>;
}

export class S3ObjectStorage {
  private readonly endpoint: URL;

  constructor(private readonly config: S3ObjectStorageConfig) {
    this.endpoint = new URL(config.endpoint.startsWith("http") ? config.endpoint : `https://${config.endpoint}`);
  }

  async putFile(filePath: string, key: string): Promise<void> {
    const stat = fs.statSync(filePath);
    const payloadHash = await hashFile(filePath);
    const signed = this.signRequest("PUT", key, {
      payloadHash,
      extraHeaders: {
        "content-length": String(stat.size),
        "content-type": "application/octet-stream"
      }
    });

    await requestWithOptionalBody(signed, "PUT", fs.createReadStream(filePath));
  }

  async deleteObject(key: string): Promise<void> {
    const signed = this.signRequest("DELETE", key, {
      payloadHash: hashText("")
    });
    await requestWithOptionalBody(signed, "DELETE");
  }

  async putBucketCors(allowedOrigins: string[]): Promise<void> {
    const xml = [
      "<CORSConfiguration>",
      "  <CORSRule>",
      ...allowedOrigins.map((origin) => `    <AllowedOrigin>${escapeXml(origin)}</AllowedOrigin>`),
      "    <AllowedMethod>GET</AllowedMethod>",
      "    <AllowedMethod>HEAD</AllowedMethod>",
      "    <AllowedMethod>PUT</AllowedMethod>",
      "    <AllowedHeader>*</AllowedHeader>",
      "    <ExposeHeader>ETag</ExposeHeader>",
      "    <MaxAgeSeconds>3000</MaxAgeSeconds>",
      "  </CORSRule>",
      "</CORSConfiguration>"
    ].join("\n");
    const signed = this.signRequest("PUT", "", {
      canonicalUri: this.bucketCanonicalUri(),
      queryParams: [["cors", ""]],
      payloadHash: hashText(xml),
      extraHeaders: {
        "content-length": String(Buffer.byteLength(xml)),
        "content-type": "application/xml"
      }
    });

    await requestWithOptionalBody(signed, "PUT", Buffer.from(xml));
  }

  async downloadToFile(key: string, targetPath: string): Promise<void> {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const tmpPath = `${targetPath}.download`;
    const signedUrl = this.createPresignedGetUrl(key, path.basename(targetPath), 300);

    await new Promise<void>((resolve, reject) => {
      const client = signedUrl.startsWith("https:") ? https : http;
      const request = client.get(signedUrl, (response) => {
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          collectResponseBody(response)
            .then((body) => reject(new Error(`S3 download failed with ${response.statusCode}: ${body}`)))
            .catch(reject);
          return;
        }

        const output = fs.createWriteStream(tmpPath);
        pipeline(response, output)
          .then(() => {
            fs.renameSync(tmpPath, targetPath);
            resolve();
          })
          .catch(reject);
      });
      request.on("error", reject);
    }).catch((error) => {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
      throw error;
    });
  }

  createPresignedGetUrl(key: string, downloadName: string, ttlSeconds = this.config.presignedUrlTtlSeconds): string {
    void downloadName;
    return this.createPresignedUrl("GET", key, ttlSeconds);
  }

  createPresignedPutUrl(key: string, ttlSeconds = this.config.presignedUrlTtlSeconds): string {
    return this.createPresignedUrl("PUT", key, ttlSeconds);
  }

  private createPresignedUrl(
    method: "GET" | "PUT",
    key: string,
    ttlSeconds: number,
    extraParams: Array<[string, string]> = []
  ): string {
    const { amzDate, dateStamp } = amzDates(new Date());
    const credentialScope = this.credentialScope(dateStamp);
    const credential = `${this.config.accessKeyId}/${credentialScope}`;
    const canonicalUri = this.canonicalUri(key);
    const host = this.host();
    const params: Array<[string, string]> = [
      ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
      ["X-Amz-Credential", credential],
      ["X-Amz-Date", amzDate],
      ["X-Amz-Expires", String(ttlSeconds)],
      ["X-Amz-SignedHeaders", "host"],
      ...extraParams
    ];
    const canonicalQuery = canonicalQueryString(params);
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${host}\n`,
      "host",
      "UNSIGNED-PAYLOAD"
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      hashText(canonicalRequest)
    ].join("\n");
    const signature = hmacHex(this.signingKey(dateStamp), stringToSign);
    const signedQuery = canonicalQueryString([...params, ["X-Amz-Signature", signature]]);

    return `${this.endpoint.protocol}//${host}${canonicalUri}?${signedQuery}`;
  }

  private signRequest(
    method: RequestMethod,
    key: string,
    options: {
      payloadHash: string;
      extraHeaders?: Record<string, string>;
      queryParams?: Array<[string, string]>;
      canonicalUri?: string;
    }
  ): SignedRequest {
    const now = new Date();
    const { amzDate, dateStamp } = amzDates(now);
    const canonicalUri = options.canonicalUri || this.canonicalUri(key);
    const canonicalQuery = canonicalQueryString(options.queryParams || []);
    const host = this.host();
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": options.payloadHash,
      "x-amz-date": amzDate,
      ...(options.extraHeaders || {})
    };
    const signedHeaderNames = Object.keys(headers)
      .map((header) => header.toLowerCase())
      .sort();
    const canonicalHeaders = signedHeaderNames
      .map((header) => `${header}:${normalizeHeaderValue(headers[header])}\n`)
      .join("");
    const signedHeaders = signedHeaderNames.join(";");
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders,
      options.payloadHash
    ].join("\n");
    const credentialScope = this.credentialScope(dateStamp);
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      credentialScope,
      hashText(canonicalRequest)
    ].join("\n");
    const signature = hmacHex(this.signingKey(dateStamp), stringToSign);
    const authorization = [
      `AWS4-HMAC-SHA256 Credential=${this.config.accessKeyId}/${credentialScope}`,
      `SignedHeaders=${signedHeaders}`,
      `Signature=${signature}`
    ].join(", ");

    const url = new URL(this.endpoint.toString());
    return {
      url,
      requestPath: canonicalQuery ? `${canonicalUri}?${canonicalQuery}` : canonicalUri,
      headers: {
        ...headers,
        authorization
      }
    };
  }

  private canonicalUri(key: string): string {
    const safeKey = key.replace(/^\/+/, "");
    const encodedKey = safeKey.split("/").map(encodeRfc3986).join("/");
    if (this.config.forcePathStyle) {
      return `/${encodeRfc3986(this.config.bucket)}/${encodedKey}`;
    }
    return `/${encodedKey}`;
  }

  private bucketCanonicalUri(): string {
    if (this.config.forcePathStyle) {
      return `/${encodeRfc3986(this.config.bucket)}`;
    }
    return "/";
  }

  private host(): string {
    if (this.config.forcePathStyle) {
      return this.endpoint.host;
    }
    return `${this.config.bucket}.${this.endpoint.host}`;
  }

  private credentialScope(dateStamp: string): string {
    return `${dateStamp}/${this.config.region}/s3/aws4_request`;
  }

  private signingKey(dateStamp: string): Buffer {
    const dateKey = hmacBuffer(`AWS4${this.config.secretAccessKey}`, dateStamp);
    const dateRegionKey = hmacBuffer(dateKey, this.config.region);
    const dateRegionServiceKey = hmacBuffer(dateRegionKey, "s3");
    return hmacBuffer(dateRegionServiceKey, "aws4_request");
  }
}

async function requestWithOptionalBody(
  signed: SignedRequest,
  method: RequestMethod,
  body?: NodeJS.ReadableStream | Buffer
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const client = signed.url.protocol === "https:" ? https : http;
    const request = client.request(
      {
        protocol: signed.url.protocol,
        hostname: signed.url.hostname,
        port: signed.url.port,
        method,
        path: signed.requestPath,
        headers: signed.headers
      },
      (response) => {
        if (response.statusCode && response.statusCode >= 200 && response.statusCode < 300) {
          response.resume();
          response.on("end", resolve);
          return;
        }

        collectResponseBody(response)
          .then((text) => reject(new Error(`S3 ${method} failed with ${response.statusCode}: ${text}`)))
          .catch(reject);
      }
    );
    request.on("error", reject);

    if (Buffer.isBuffer(body)) {
      request.end(body);
    } else if (body) {
      body.pipe(request);
    } else {
      request.end();
    }
  });
}

async function collectResponseBody(response: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of response) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function hashFile(filePath: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacBuffer(key: string | Buffer, value: string): Buffer {
  return crypto.createHmac("sha256", key).update(value).digest();
}

function hmacHex(key: string | Buffer, value: string): string {
  return crypto.createHmac("sha256", key).update(value).digest("hex");
}

function amzDates(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8)
  };
}

function canonicalQueryString(params: Array<[string, string]>): string {
  return [...params]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyCompare = encodeRfc3986(leftKey).localeCompare(encodeRfc3986(rightKey));
      return keyCompare || encodeRfc3986(leftValue).localeCompare(encodeRfc3986(rightValue));
    })
    .map(([key, value]) => `${encodeRfc3986(key)}=${encodeRfc3986(value)}`)
    .join("&");
}

function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function normalizeHeaderValue(value: string): string {
  return String(value).trim().replace(/\s+/g, " ");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
