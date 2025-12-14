#!/bin/bash
# 文件: check_environment.sh
# 用途: 全面检查PAROL6项目环境

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔍 PAROL6 环境检查工具"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 计数器
PASS=0
FAIL=0
WARN=0

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARN++))
}

echo "1️⃣  系统环境"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 操作系统
OS_INFO=$(lsb_release -ds 2>/dev/null || cat /etc/os-release | grep PRETTY_NAME | cut -d'"' -f2)
echo "   操作系统: $OS_INFO"

# Python版本
if command -v python3 &> /dev/null; then
    PY_VERSION=$(python3 --version)
    check_pass "Python: $PY_VERSION"
else
    check_fail "Python 未安装"
fi

# Node.js版本
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js: $NODE_VERSION"
else
    check_fail "Node.js 未安装"
fi

# npm版本
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    check_pass "npm: v$NPM_VERSION"
else
    check_fail "npm 未安装"
fi

# PM2版本
if command -v pm2 &> /dev/null; then
    PM2_VERSION=$(pm2 --version)
    check_pass "PM2: v$PM2_VERSION"
else
    check_fail "PM2 未安装（运行: sudo npm install -g pm2）"
fi

echo ""
echo "2️⃣  Python虚拟环境"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

VENV_PATH="/l2k/home/wzy/21-L2Karm/envs/parol6_ws"
if [ -d "$VENV_PATH" ]; then
    check_pass "虚拟环境路径: $VENV_PATH"
    
    # 激活并检查依赖
    source $VENV_PATH/bin/activate
    
    $VENV_PATH/bin/python3 << 'EOF'
dependencies = [
    ('fastapi', 'FastAPI'),
    ('uvicorn', 'Uvicorn'),
    ('websockets', 'WebSockets'),
    ('pydantic', 'Pydantic'),
    ('yaml', 'PyYAML'),
    ('numpy', 'NumPy'),
    ('cv2', 'OpenCV'),
    ('serial', 'PySerial'),
    ('psutil', 'psutil'),
    ('oclock', 'oclock'),
]

import sys
missing = []
for module, name in dependencies:
    try:
        mod = __import__(module)
        version = getattr(mod, '__version__', '未知')
        print(f"   ✓ {name:15s} v{version}")
    except ImportError:
        print(f"   ✗ {name:15s} 未安装")
        missing.append(name)

if missing:
    print(f"\n   缺少依赖: {', '.join(missing)}")
    print("   运行: pip install -r requirements.txt")
    sys.exit(1)
EOF

    if [ $? -eq 0 ]; then
        check_pass "所有Python依赖已安装"
    else
        check_fail "Python依赖不完整"
    fi
else
    check_fail "虚拟环境未找到: $VENV_PATH"
fi

echo ""
echo "3️⃣  项目文件"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PROJECT_DIR="/l2k/home/wzy/21-L2Karm/10-parol6-web-pliot"

# 检查关键文件
files=(
    "config.yaml:配置文件"
    "ecosystem.config.js:PM2配置"
    "requirements.txt:Python依赖"
    "frontend/package.json:前端配置"
    "api/fastapi_server.py:API服务器"
    "commander/commander.py:控制器"
)

for item in "${files[@]}"; do
    IFS=':' read -r file desc <<< "$item"
    if [ -f "$PROJECT_DIR/$file" ]; then
        check_pass "$desc: $file"
    else
        check_fail "$desc 缺失: $file"
    fi
done

# 检查前端依赖
if [ -d "$PROJECT_DIR/frontend/node_modules" ]; then
    check_pass "前端依赖已安装"
else
    check_warn "前端依赖未安装（运行: cd frontend && npm install）"
fi

echo ""
echo "4️⃣  系统配置"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 串口权限
if groups | grep -q dialout; then
    check_pass "用户在 dialout 组（串口权限）"
else
    check_warn "用户不在 dialout 组"
    echo "      运行: sudo usermod -a -G dialout $USER"
    echo "      然后注销并重新登录"
fi

# 串口设备
if ls /dev/ttyACM* &> /dev/null; then
    PORTS=$(ls /dev/ttyACM* | tr '\n' ' ')
    check_pass "串口设备: $PORTS"
else
    check_warn "未检测到串口设备 /dev/ttyACM*"
fi

# 中文字体
if fc-list :lang=zh | grep -q "WenQuanYi\|Noto"; then
    check_pass "中文字体已安装"
else
    check_warn "中文字体未安装（运行: sudo apt install fonts-wqy-microhei）"
fi

echo ""
echo "5️⃣  网络端口"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查端口
ports=(
    "3000:前端服务"
    "35611:API服务"
    "5001:Commander命令"
    "5002:Commander确认"
)

for item in "${ports[@]}"; do
    IFS=':' read -r port desc <<< "$item"
    if sudo lsof -i :$port &> /dev/null; then
        PID=$(sudo lsof -i :$port -t)
        PROCESS=$(ps -p $PID -o comm= 2>/dev/null || echo "未知")
        check_warn "端口 $port 已被占用 ($desc, PID:$PID, 进程:$PROCESS)"
    else
        check_pass "端口 $port 可用 ($desc)"
    fi
done

echo ""
echo "6️⃣  PM2 服务状态"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if command -v pm2 &> /dev/null; then
    pm2 list | tail -n +2
else
    check_fail "PM2 未安装"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 检查结果汇总"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "   ${GREEN}通过: $PASS${NC}"
echo -e "   ${RED}失败: $FAIL${NC}"
echo -e "   ${YELLOW}警告: $WARN${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $FAIL -gt 0 ]; then
    echo "❌ 环境检查未通过，请解决上述问题后重试"
    exit 1
else
    echo "✅ 环境检查通过！可以运行: ./start_parol6.sh"
    exit 0
fi
