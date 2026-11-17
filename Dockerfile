FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY src ./src
COPY scripts/build.mjs ./scripts/build.mjs
COPY public ./public
RUN npm run build
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json server.mjs ./
COPY --from=build --chown=node:node /app/dist ./dist
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
