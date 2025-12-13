#!/bin/bash
# =============================================================================
# PAROL6 串口自动检测脚本
# Auto-detect PAROL6 robot serial port and update config.yaml
# 
# 功能:
#   1. 自动检测 STMicroelectronics F446 设备 (PAROL6 控制器)
#   2. 更新 config.yaml 中的 com_port 配置
#   3. 可选: 重启 PM2 服务
#
# 使用方法:
#   ./auto_detect_serial.sh          # 检测并更新配置
#   ./auto_detect_serial.sh --restart # 检测、更新并重启服务
# =============================================================================

set -e

# 项目路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.yaml"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=============================================="
echo "PAROL6 串口自动检测"
echo "=============================================="

# 检测 PAROL6 串口 (STMicroelectronics F446 或 Virtual COM Port)
detect_parol6_port() {
    local port=""
    
    # 方法1: 通过 /dev/serial/by-id 查找 STM32 设备
    if [ -d /dev/serial/by-id ]; then
        # 查找 STMicroelectronics 或 F446 设备
        port=$(ls -la /dev/serial/by-id/ 2>/dev/null | grep -i "STMicroelectronics\|F446" | head -1 | awk -F'/' '{print $NF}')
        if [ -n "$port" ]; then
            echo "/dev/$port"
            return 0
        fi
    fi
    
    # 方法2: 通过 udevadm 检查每个 ttyACM 设备
    for dev in /dev/ttyACM*; do
        if [ -e "$dev" ]; then
            vendor=$(udevadm info --query=all --name="$dev" 2>/dev/null | grep "ID_VENDOR_ID=" | cut -d'=' -f2)
            model=$(udevadm info --query=all --name="$dev" 2>/dev/null | grep "ID_MODEL=" | cut -d'=' -f2)
            
            # STMicroelectronics 的 USB Vendor ID 是 0483
            if [ "$vendor" = "0483" ]; then
                echo "$dev"
                return 0
            fi
        fi
    done
    
    return 1
}

# 获取当前配置的串口
get_current_port() {
    if [ -f "$CONFIG_FILE" ]; then
        grep "com_port:" "$CONFIG_FILE" | head -1 | awk '{print $2}'
    else
        echo "未找到配置文件"
    fi
}

# 更新配置文件中的串口
update_config() {
    local new_port="$1"
    
    if [ ! -f "$CONFIG_FILE" ]; then
        echo -e "${RED}错误: 配置文件不存在: ${CONFIG_FILE}${NC}"
        return 1
    fi
    
    # 使用 sed 替换 com_port 行
    sed -i "s|com_port:.*|com_port: ${new_port}|" "$CONFIG_FILE"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}配置已更新${NC}"
        return 0
    else
        echo -e "${RED}更新配置失败${NC}"
        return 1
    fi
}

# 主逻辑
main() {
    # 显示当前配置
    current_port=$(get_current_port)
    echo -e "当前配置串口: ${YELLOW}${current_port}${NC}"
    
    # 检测设备
    echo ""
    echo "正在检测 PAROL6 设备..."
    
    detected_port=$(detect_parol6_port)
    
    if [ -z "$detected_port" ]; then
        echo -e "${RED}未检测到 PAROL6 设备 (STMicroelectronics/F446)${NC}"
        echo ""
        echo "可用的串口设备:"
        ls -la /dev/ttyACM* /dev/ttyUSB* 2>/dev/null | while read line; do
            echo "  $line"
        done
        exit 1
    fi
    
    echo -e "检测到 PAROL6 串口: ${GREEN}${detected_port}${NC}"
    
    # 显示设备信息
    echo ""
    echo "设备信息:"
    udevadm info --query=all --name="$detected_port" 2>/dev/null | grep -E "(ID_VENDOR=|ID_MODEL=|ID_SERIAL_SHORT=)" | sed 's/^E: /  /'
    
    # 检查是否需要更新
    if [ "$current_port" = "$detected_port" ]; then
        echo ""
        echo -e "${GREEN}配置已是正确的串口，无需更新${NC}"
    else
        echo ""
        echo "更新配置..."
        update_config "$detected_port"
        echo -e "串口配置: ${YELLOW}${current_port}${NC} -> ${GREEN}${detected_port}${NC}"
    fi
    
    # 检查是否需要重启服务
    if [ "$1" = "--restart" ] || [ "$1" = "-r" ]; then
        echo ""
        echo "重启 Commander 服务..."
        if command -v pm2 &> /dev/null; then
            pm2 restart parol-commander
            echo -e "${GREEN}服务已重启${NC}"
        else
            echo -e "${YELLOW}PM2 未安装，请手动重启服务${NC}"
        fi
    else
        echo ""
        echo -e "${YELLOW}提示: 运行 'pm2 restart parol-commander' 使配置生效${NC}"
        echo "或使用: $0 --restart"
    fi
    
    echo ""
    echo "=============================================="
}

main "$@"
