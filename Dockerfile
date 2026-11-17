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
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node server.mjs ./
COPY --chown=node:node server ./server
COPY --chown=node:node db ./db
COPY --from=build --chown=node:node /app/dist ./dist
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
