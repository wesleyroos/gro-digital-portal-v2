FROM node:22-alpine

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10 --quiet

# Install deps as a cacheable layer — only re-runs when lockfile changes
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

EXPOSE 3000
ENV NODE_ENV=production

CMD ["sh", "-c", "node scripts/migrate.js && node dist/index.js"]
