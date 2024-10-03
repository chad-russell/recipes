FROM oven/bun:latest AS base
WORKDIR /usr/src/app

# dependencies
FROM base AS dependencies
COPY package.json bun.lockb .
RUN bun install --frozen-lockfile --production

# build
FROM dependencies AS build
COPY . .
RUN bun run build

# run
FROM build AS run
EXPOSE 3000/tcp
ENTRYPOINT ["bun", "run", "start"]
