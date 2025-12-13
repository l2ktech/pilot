#!/bin/bash
# 文件: setup_aliases.sh
# 用途: 一键配置PAROL6快捷命令

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔧 PAROL6 快捷命令配置工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

BASHRC="$HOME/.bashrc"
MARKER="# PAROL6 快捷命令 - 自动生成"

# 检查是否已经配置
if grep -q "$MARKER" "$BASHRC"; then
    echo "⚠️  检测到已存在的PAROL6配置"
    read -p "是否覆盖现有配置？(y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ 取消配置"
        exit 0
    fi
    
    # 删除旧配置
    sed -i "/$MARKER/,/# PAROL6 配置结束/d" "$BASHRC"
    echo "✓ 已删除旧配置"
fi

# 添加新配置
cat >> "$BASHRC" << 'EOF'

# PAROL6 快捷命令 - 自动生成
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# 项目路径
export PAROL6_PROJECT="/l2k/home/wzy/21-L2Karm/10-parol6-web-pliot"
export PAROL6_VENV="/l2k/home/wzy/21-L2Karm/envs/parol6_ws"

# 导航命令
alias parol6-cd='cd $PAROL6_PROJECT'

# 环境命令
alias parol6-env='source $PAROL6_VENV/bin/activate'

# 服务管理
alias parol6-start='cd $PAROL6_PROJECT && ./start_parol6.sh'
alias parol6-check='cd $PAROL6_PROJECT && ./check_environment.sh'
alias parol6-stop='pm2 stop all'
alias parol6-restart='pm2 restart all'
alias parol6-delete='pm2 delete all'

# 日志和监控
alias parol6-logs='pm2 logs'
alias parol6-logs-api='pm2 logs parol-api'
alias parol6-logs-cmd='pm2 logs parol-commander'
alias parol6-logs-web='pm2 logs parol-nextjs'
alias parol6-status='pm2 list'
alias parol6-monit='pm2 monit'

# 开发命令
alias parol6-dev='cd $PAROL6_PROJECT/frontend && npm run dev'
alias parol6-build='cd $PAROL6_PROJECT/frontend && npm run build'

# PAROL6 配置结束
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

EOF

echo "✅ 快捷命令已添加到 $BASHRC"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📋 已配置的快捷命令:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🗂️  导航命令:"
echo "   parol6-cd         - 进入项目目录"
echo ""
echo "🔧 环境命令:"
echo "   parol6-env        - 激活Python虚拟环境"
echo "   parol6-check      - 检查环境配置"
echo ""
echo "🚀 服务管理:"
echo "   parol6-start      - 启动所有服务"
echo "   parol6-stop       - 停止所有服务"
echo "   parol6-restart    - 重启所有服务"
echo "   parol6-delete     - 删除所有PM2进程"
echo ""
echo "📊 日志和监控:"
echo "   parol6-status     - 查看服务状态"
echo "   parol6-logs       - 查看所有日志"
echo "   parol6-logs-api   - 查看API日志"
echo "   parol6-logs-cmd   - 查看Commander日志"
echo "   parol6-logs-web   - 查看前端日志"
echo "   parol6-monit      - 实时监控"
echo ""
echo "💻 开发命令:"
echo "   parol6-dev        - 前端开发模式"
echo "   parol6-build      - 构建前端"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  重要: 运行以下命令使配置生效:"
echo ""
echo "   source ~/.bashrc"
echo ""
echo "或者关闭并重新打开终端。"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

