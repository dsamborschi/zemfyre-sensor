FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production

# Install libnotify-bin, but don't fail if it's not available
RUN apt-get update && apt-get install -y libnotify-bin || true

COPY . .

EXPOSE 3001
CMD ["npm", "start"]
