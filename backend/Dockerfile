FROM node:24.21.0-alpine AS build
WORKDIR /app
COPY package*.json .npmrc ./
RUN npm install --global npm@11.19.0 --ignore-scripts
RUN npm ci --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts
FROM node:24.21.0-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3110
# Better Auth's tables are created or updated before the server starts.
CMD ["sh", "-c", "node dist/migrate.js && node dist/server.js"]
