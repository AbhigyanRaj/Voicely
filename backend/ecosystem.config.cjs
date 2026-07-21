module.exports = {
  apps: [
    {
      name: "voicely-backend",
      script: "./src/server.js",
      instances: "max", // Utilize all CPU cores
      exec_mode: "cluster", // Enable cluster mode
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      }
    }
  ]
};
