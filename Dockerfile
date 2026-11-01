FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install -g pnpm@11.25.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src/rules.ts ./src/rules.ts
COPY --from=build /app/src/catalog.ts ./src/catalog.ts
COPY package.json ./
ENV PORT=8787 DATA_DIR=/data
EXPOSE 8787
CMD ["node", "--experimental-strip-types", "server/index.ts"]
