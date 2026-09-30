# Một Dockerfile, nhiều target: migrate · server · web (docs/PLAN.md §2, D10).
FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --offline
# Next tính rewrites lúc build → địa chỉ server nội bộ phải có ở bước này.
ARG API_ORIGIN=http://server:4000
ENV API_ORIGIN=$API_ORIGIN
RUN pnpm build

# Tách riêng: `pnpm deploy --prod` sửa trạng thái cài đặt của workspace, không được làm bẩn stage build.
FROM build AS server-bundle
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @xom/server deploy --legacy --prod /out/server

# Chạy migration một lần rồi thoát (prisma CLI nằm trong devDependencies nên dùng stage build).
FROM build AS migrate
WORKDIR /app/apps/server
CMD ["./node_modules/.bin/prisma", "migrate", "deploy"]

FROM base AS server
ENV NODE_ENV=production PORT=4000
COPY --from=server-bundle /out/server ./
USER node
EXPOSE 4000
CMD ["node", "dist/main.js"]

FROM base AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
