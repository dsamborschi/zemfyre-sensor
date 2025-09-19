FROM node:20

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --production
RUN apt-get update && apt-get install -y libnotify-bin

COPY . .

EXPOSE 3001
# cd api && npm start1
CMD ["npm", "start"]
