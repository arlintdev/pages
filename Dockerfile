FROM oven/bun:latest AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:latest
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY server/ ./server/
RUN mkdir -p /app/data
VOLUME /app/data
ENV NODE_ENV=production
EXPOSE 3000
CMD ["bun", "server/index.ts"]
