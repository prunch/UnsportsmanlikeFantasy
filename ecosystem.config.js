module.exports = {
  apps: [
    {
      name: 'gridiron-api',
      script: './api/dist/index.js',
      cwd: '/opt/gridiron-cards',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      log_file: '/var/log/gridiron/combined.log',
      out_file: '/var/log/gridiron/out.log',
      error_file: '/var/log/gridiron/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }
  ]
};
