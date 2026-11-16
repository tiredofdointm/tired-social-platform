FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node public ./public
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
