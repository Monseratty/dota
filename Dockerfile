FROM node:22-bookworm-slim AS app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    g++ \
    make \
    openjdk-17-jdk-headless \
    python3 \
  && rm -rf /var/lib/apt/lists/*

ENV LANG=C.UTF-8 \
  LC_ALL=C.UTF-8 \
  JAVA_TOOL_OPTIONS=-Dfile.encoding=UTF-8

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

ARG VITE_API_BASE=/
ENV VITE_API_BASE=${VITE_API_BASE}
COPY vendor/clarity vendor/clarity
RUN cd vendor/clarity && ./gradlew --no-daemon -q writeRuntimeClasspath

COPY . .
RUN npm --workspace apps/web run build

ENV NODE_ENV=production \
  CLARITY_RUNNER=java \
  CLARITY_JAVA_XMX=512m

FROM nginx:1.27-alpine AS web

COPY deploy/nginx.web.conf /etc/nginx/conf.d/default.conf
COPY --from=app /app/apps/web/dist /usr/share/nginx/html
