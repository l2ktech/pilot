module.exports = {
  apps: [
    {
      name: 'parol-nextjs',
      script: 'npm',
      args: 'run dev',
      cwd: '/l2k/home/wzy/21-L2Karm/10-parol6-web-pliot/frontend',
      env: {
        NODE_ENV: 'development',
        PORT: '3000'
      },
      autorestart: true,
      watch: false,  // Next.js has its own hot reload
      max_memory_restart: '1G',
      error_file: '/home/wzy/.pm2/logs/parol-nextjs-error.log',
      out_file: '/home/wzy/.pm2/logs/parol-nextjs-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      instances: 1
    },
    {
      name: 'parol-commander',
      script: 'commander.py',
      interpreter: '/l2k/home/wzy/21-L2Karm/envs/10-parol6-web-pliot/bin/python3',
      cwd: '/l2k/home/wzy/21-L2Karm/10-parol6-web-pliot/commander',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: '/l2k/home/wzy/21-L2Karm/10-parol6-web-pliot'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/home/wzy/.pm2/logs/parol-commander-error.log',
      out_file: '/home/wzy/.pm2/logs/parol-commander-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      instances: 1
    },
    {
      name: 'parol-api',
      script: 'fastapi_server.py',
      interpreter: '/l2k/home/wzy/21-L2Karm/envs/10-parol6-web-pliot/bin/python3',
      cwd: '/l2k/home/wzy/21-L2Karm/10-parol6-web-pliot/api',
      env: {
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: '/l2k/home/wzy/21-L2Karm/10-parol6-web-pliot'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      error_file: '/home/wzy/.pm2/logs/parol-api-error.log',
      out_file: '/home/wzy/.pm2/logs/parol-api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      instances: 1
    }
  ]
};
