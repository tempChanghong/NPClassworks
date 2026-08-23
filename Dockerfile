FROM node:22-alpine AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_DEFAULT_KV_SERVER=
ARG VITE_ENABLE_ANALYTICS=false
ENV VITE_DEFAULT_KV_SERVER=$VITE_DEFAULT_KV_SERVER
ENV VITE_ENABLE_ANALYTICS=$VITE_ENABLE_ANALYTICS
RUN pnpm run build && pnpm run pwa:validate

FROM nginx:1.27-alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
