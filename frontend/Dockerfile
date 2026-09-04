# Stage 1: Compiling application statics
FROM node:18-alpine AS builder

WORKDIR /app

# Install dependencies copy
COPY package*.json ./
RUN npm ci

# Copy full code and build
COPY . .
RUN npm run build

# Stage 2: Packaging statics with Nginx
FROM nginx:alpine

# Copy nginx config file
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output from Stage 1
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
