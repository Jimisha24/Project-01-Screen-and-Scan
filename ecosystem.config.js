module.exports = {
  apps: [
    {
      name: "globalradar-api",
      script: "./server.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production",
        PORT: 8080
      }
    },
    {
      name: "globalradar-sync",
      script: "./sync.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
