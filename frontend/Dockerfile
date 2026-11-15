# Stage 1: build the Vite bundle
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

# Stage 2: serve static files and proxy /api to the backend
FROM nginx:1.27-alpine
ENV PORT=8080 \
    BACKEND_URL=http://backend:8080
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
