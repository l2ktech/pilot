#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
UDP 指令桥接 -> 新版 PAROL6USB 类

目标：
- 保持原有 UDP 指令协议兼容（MOVEJOINT/MOVEPOSE/MOVECART/GET_* 等）
- 使用 12-unified-control/src/parol6_usb.py 统一控制类直连机械臂
- 提供基础关节/笛卡尔/夹爪/IO/急停控制与状态查询

用法：
    python3 commander/parol6_usb_bridge.py

注意：
- 当前实现为轻量 MVP：顺序执行队列，不包含原 commander 中的 100Hz 插值/混合轨迹。
- 适合在 ROS2 未就绪时快速打通 Web → API → UDP → 机械臂链路。
"""

from __future__ import annotations

import logging
import os
import queue
import select
import socket
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import yaml
from spatialmath import SE3

# ---------------------------------------------------------------------------
# 路径设置：把统一控制层加入 sys.path
# ---------------------------------------------------------------------------
L2KARM_ROOT = Path(__file__).resolve().parents[2]  # /21-L2Karm/
PROJECT_ROOT = Path(__file__).resolve().parents[1]  # /10-parol6-web-pliot/
UNIFIED_CTRL_SRC = L2KARM_ROOT / "12-unified-control" / "src"
if UNIFIED_CTRL_SRC.exists():
    sys.path.insert(0, str(UNIFIED_CTRL_SRC))

try:
    from parol6_usb import PAROL6USB, RobotState as UsbRobotState
except Exception as exc:  # pragma: no cover - 运行期导入
    raise RuntimeError(f"无法导入 PAROL6USB，请确认 12-unified-control 已就绪: {exc}") from exc

# ---------------------------------------------------------------------------
# 配置与日志
# ---------------------------------------------------------------------------
CONFIG_PATH = PROJECT_ROOT / "config.yaml"  # 10-parol6-web-pliot/config.yaml

with open(CONFIG_PATH, "r") as f:
    _config = yaml.safe_load(f)

ROBOT_CFG = _config.get("robot", {})
SERVER_CFG = _config.get("server", {})

COMMAND_PORT = SERVER_CFG.get("command_port", 5001)
ACK_PORT = SERVER_CFG.get("ack_port", 5002)
LOOP_INTERVAL = SERVER_CFG.get("loop_interval", 0.01)

LOG_LEVEL = _config.get("logging", {}).get("commander", {}).get("level", "INFO")
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="[%(asctime)s][%(levelname)s] %(message)s",
)
logger = logging.getLogger("parol6_usb_bridge")


# ---------------------------------------------------------------------------
# 命令任务描述
# ---------------------------------------------------------------------------
@dataclass
class CommandTask:
    cmd_id: Optional[str]
    name: str
    args: List[str]
    sender: Tuple[str, int]


# ---------------------------------------------------------------------------
# 机器人桥接封装
# ---------------------------------------------------------------------------
class RobotBridge:
    """对 PAROL6USB 做一个轻量封装，提供线程安全访问与状态缓存。"""

    def __init__(self):
        port = ROBOT_CFG.get("com_port", "/dev/ttyACM0")
        baud = ROBOT_CFG.get("baud_rate", 3_000_000)
        self.robot = PAROL6USB(port=port, baudrate=baud, logger=logger)
        self._lock = threading.Lock()
        self._last_state = {}
        self._running = True
        self._poll_thread = threading.Thread(target=self._poll_loop, daemon=True)
        self._poll_thread.start()

    # ---------------------------- 基础连接/状态 ----------------------------
    def ensure_connected(self) -> bool:
        with self._lock:
            if self.robot._state == UsbRobotState.DISCONNECTED:
                if not self.robot.connect():
                    logger.warning("串口未连接，重试中...")
                    return False
            if not self.robot._enabled and ROBOT_CFG.get("estop_enabled", True):
                self.robot.enable()
        return True

    def snapshot(self) -> dict:
        with self._lock:
            return dict(self._last_state)

    # ---------------------------- 轮询线程 ----------------------------
    def _poll_loop(self):
        """持续刷新位置/IO，提供 GET_* 的快速响应。"""
        while self._running:
            try:
                if not self.ensure_connected():
                    time.sleep(1.0)
                    continue

                # communication_loop 会刷新 protocol.* 输入缓存
                self.robot.protocol.communication_loop()

                joints = [
                    self.robot._steps_to_angle(steps, idx) + self.robot.HOME_POSITION_OFFSET[idx]
                    for idx, steps in enumerate(self.robot.protocol.position_in)
                ]
                speeds = list(self.robot.protocol.speed_in)
                homed = list(self.robot.protocol.homed_in)
                io_in = list(self.robot.protocol.inout_in)

                pose_vec: Optional[List[float]] = None
                cart = self.robot.get_cartesian()
                if cart:
                    xyz_m, rpy_deg = cart
                    T = SE3.Trans(xyz_m[0], xyz_m[1], xyz_m[2]) * SE3.RPY(
                        rpy_deg[0], rpy_deg[1], rpy_deg[2], unit="deg", order="xyz"
                    )
                    pose_vec = list(T.A.flatten())

                with self._lock:
                    self._last_state = {
                        "joints": joints,
                        "speeds": speeds,
                        "homed": homed,
                        "io": io_in,
                        "pose_matrix": pose_vec,
                        "estop": io_in[4] == 0 if len(io_in) > 4 else False,
                        "hz": round(1.0 / LOOP_INTERVAL, 1),
                    }
            except Exception as exc:  # pragma: no cover - 运行时防御
                logger.debug(f"状态轮询异常: {exc}")
            finally:
                time.sleep(0.05)

    # ---------------------------- 控制命令 ----------------------------
    def home(self) -> bool:
        if not self.ensure_connected():
            return False
        return self.robot.home(wait=True, timeout=30)

    def stop(self) -> bool:
        if self.robot.estop():
            return True
        return False

    def clear_estop(self) -> bool:
        return self.robot.enable()

    def move_joints(self, target: List[float], duration: Optional[float], speed_pct: Optional[float]) -> bool:
        if not self.ensure_connected():
            return False

        speed = self._calc_speed(target, duration, speed_pct)
        return self.robot.move_joints(target, speed=speed)

    def move_pose(self, pose: List[float], duration: Optional[float], speed_pct: Optional[float]) -> bool:
        # pose: [x,y,z,rx,ry,rz] in mm/deg
        xyz = [p / 1000.0 for p in pose[:3]]
        rpy = pose[3:]
        speed = self._calc_speed(None, duration, speed_pct)
        return self.robot.move_cartesian(xyz=xyz, rpy=rpy, speed=speed)

    def move_cartesian(self, pose: List[float], duration: Optional[float], speed_pct: Optional[float]) -> bool:
        return self.move_pose(pose, duration, speed_pct)

    def execute_trajectory(self, trajectory: List[List[float]], duration: Optional[float]) -> bool:
        if not self.ensure_connected():
            return False
        # 粗略按时长分配每段时间
        step_time = 0.05
        if duration and duration > 0 and len(trajectory) > 0:
            step_time = max(duration / len(trajectory), 0.02)

        for target in trajectory:
            ok = self.robot.move_joints(target, speed=50.0, wait=False)
            if not ok:
                return False
            time.sleep(step_time)
        return True

    def jog_joint(self, joint_idx: int, speed_pct: float, duration: float, distance: Optional[float]) -> bool:
        if not self.ensure_connected():
            return False

        if distance and duration:
            speed = distance / duration
        else:
            speed = speed_pct
        return self.robot.jog_joint(joint_idx + 1, speed=speed, duration=duration or 0.1)

    def jog_cartesian(self, axis: str, speed_pct: float, duration: float) -> bool:
        if not self.ensure_connected():
            return False
        # 仅支持平移轴，旋转轴前端需做防护
        axis = axis.upper()
        linear_axes = {"X+": "x+", "X-": "x-", "Y+": "y+", "Y-": "y-", "Z+": "z+", "Z-": "z-"}
        if axis not in linear_axes:
            logger.warning(f"未支持的 CARTJOG 旋转轴: {axis}")
            return False
        return self.robot.jog_cartesian(linear_axes[axis], distance=speed_pct / 1000.0, speed=speed_pct)

    def set_io(self, output: int, state: bool) -> bool:
        if not self.ensure_connected():
            return False
        return self.robot.set_io(output, state)

    def gripper(self, action: Optional[str], pos: int, speed: int, current: int) -> bool:
        if not self.ensure_connected():
            return False
        if action == "calibrate":
            return self.robot.gripper_calibrate()
        return self.robot.gripper_move(position=pos, speed=speed, current=current)

    # ---------------------------- 辅助 ----------------------------
    def _calc_speed(self, target: Optional[List[float]], duration: Optional[float], speed_pct: Optional[float]) -> float:
        if speed_pct is not None:
            return float(speed_pct)

        if duration and duration > 0 and target is not None:
            current = self.snapshot().get("joints", [])
            if current and len(current) == len(target):
                max_delta = max(abs(t - c) for t, c in zip(target, current))
                est_speed = max_delta / duration
                return max(min(est_speed, 100.0), 5.0)

        return ROBOT_CFG.get("default_speed_percentage", 50.0)


# ---------------------------------------------------------------------------
# UDP 辅助
# ---------------------------------------------------------------------------
def parse_command_id(message: str) -> Tuple[Optional[str], str]:
    """兼容 [id]CMD 或 id|CMD 两种格式。"""
    if message.startswith("["):
        end_idx = message.find("]")
        if end_idx > 0:
            return message[1:end_idx], message[end_idx + 1 :]

    parts = message.split("|", 1)
    if len(parts) > 1 and len(parts[0]) == 8 and not parts[0].isupper():
        return parts[0], parts[1]
    return None, message


def send_ack(sock: socket.socket, cmd_id: Optional[str], status: str, details: str, addr: Tuple[str, int]):
    if not cmd_id:
        return
    msg = f"ACK|{cmd_id}|{status}|{details}"
    sock.sendto(msg.encode("utf-8"), (addr[0], ACK_PORT))


# ---------------------------------------------------------------------------
# 服务器主循环
# ---------------------------------------------------------------------------
def main():
    robot = RobotBridge()
    cmd_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    cmd_sock.bind(("0.0.0.0", COMMAND_PORT))

    ack_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    task_queue: queue.Queue[CommandTask] = queue.Queue()

    def worker():
        while True:
            task = task_queue.get()
            if task.cmd_id:
                send_ack(ack_sock, task.cmd_id, "EXECUTING", f"开始 {task.name}", task.sender)
            try:
                ok = dispatch_command(robot, task)
                status = "COMPLETED" if ok else "FAILED"
                detail = "OK" if ok else f"{task.name} 执行失败"
            except Exception as exc:  # pragma: no cover
                status = "FAILED"
                detail = str(exc)
                logger.error(f"{task.name} 执行异常: {exc}")
            if task.cmd_id:
                send_ack(ack_sock, task.cmd_id, status, detail, task.sender)

    threading.Thread(target=worker, daemon=True).start()
    logger.info(f"Parol6 USB commander 启动，监听 UDP {COMMAND_PORT}")

    while True:
        readable, _, _ = select.select([cmd_sock], [], [], 0.1)
        for sock in readable:
            data, addr = sock.recvfrom(65535)
            raw = data.decode("utf-8").strip()
            cmd_id, payload = parse_command_id(raw)
            parts = payload.split("|")
            name = parts[0].upper() if parts else ""
            args = parts[1:]

            # GET_* 直接响应，避免排队
            if name.startswith("GET_"):
                handle_get(robot, name, cmd_sock, addr)
                continue

            # STOP/CLEAR_ESTOP 立即执行
            if name in {"STOP", "CLEAR_ESTOP"}:
                task = CommandTask(cmd_id, name, args, addr)
                task_queue.put(task)
                if cmd_id:
                    send_ack(ack_sock, cmd_id, "QUEUED", "立即执行", addr)
                continue

            # 入队其他运动/夹爪/IO命令
            task = CommandTask(cmd_id, name, args, addr)
            task_queue.put(task)
            if cmd_id:
                send_ack(ack_sock, cmd_id, "QUEUED", f"已加入队列 {task_queue.qsize()}", addr)


# ---------------------------------------------------------------------------
# 命令分发
# ---------------------------------------------------------------------------
def dispatch_command(robot: RobotBridge, task: CommandTask) -> bool:
    name = task.name
    args = task.args

    if name == "HOME":
        return robot.home()
    if name == "STOP":
        return robot.stop()
    if name == "CLEAR_ESTOP":
        return robot.clear_estop()

    if name == "MOVEJOINT":
        if len(args) != 8:
            return False
        target = [float(v) for v in args[0:6]]
        duration = None if args[6].upper() == "NONE" else float(args[6])
        speed = None if args[7].upper() == "NONE" else float(args[7])
        return robot.move_joints(target, duration, speed)

    if name in {"MOVEPOSE", "MOVECART"}:
        if len(args) != 8:
            return False
        pose = [float(v) for v in args[0:6]]
        duration = None if args[6].upper() == "NONE" else float(args[6])
        speed = None if args[7].upper() == "NONE" else float(args[7])
        return robot.move_pose(pose, duration, speed)

    if name == "EXECUTETRAJECTORY":
        import json

        if len(args) != 2:
            return False
        trajectory = json.loads(args[0])
        duration = None if args[1].upper() == "NONE" else float(args[1])
        return robot.execute_trajectory(trajectory, duration)

    if name == "JOG":
        if len(args) != 4:
            return False
        joint = int(args[0])
        speed_pct = float(args[1])
        duration = None if args[2].upper() == "NONE" else float(args[2])
        distance = None if args[3].upper() == "NONE" else float(args[3])
        return robot.jog_joint(joint, speed_pct, duration or 0.1, distance)

    if name == "CARTJOG":
        if len(args) != 4:
            return False
        frame = args[0].upper()
        axis = args[1]
        speed_pct = float(args[2])
        duration = float(args[3])
        if frame not in {"WRF", "TRF"}:
            return False
        return robot.jog_cartesian(axis, speed_pct, duration)

    if name == "SET_IO":
        if len(args) != 2:
            return False
        output = int(args[0])
        state = bool(int(args[1]))
        return robot.set_io(output, state)

    if name == "ELECTRICGRIPPER":
        if len(args) != 4:
            return False
        action_raw = args[0].lower()
        action = None if action_raw in {"none", "move"} else action_raw
        pos, spd, curr = int(args[1]), int(args[2]), int(args[3])
        return robot.gripper(action, pos, spd, curr)

    if name == "DELAY":
        if len(args) != 1:
            return False
        time.sleep(float(args[0]))
        return True

    logger.warning(f"未识别指令: {name}")
    return False


# ---------------------------------------------------------------------------
# GET_* 响应
# ---------------------------------------------------------------------------
def handle_get(robot: RobotBridge, name: str, sock: socket.socket, addr: Tuple[str, int]):
    state = robot.snapshot()

    if name == "GET_ANGLES":
        angles = state.get("joints")
        if angles:
            msg = "ANGLES|" + ",".join(f"{a:.4f}" for a in angles)
            sock.sendto(msg.encode("utf-8"), addr)
        return

    if name == "GET_POSE":
        pose_matrix = state.get("pose_matrix")
        if pose_matrix:
            msg = "POSE|" + ",".join(str(v) for v in pose_matrix)
            sock.sendto(msg.encode("utf-8"), addr)
        return

    if name == "GET_IO":
        io_vals = state.get("io", [])
        # 兼容 API 期望的 5 个字段，后续位填 0
        padded = (io_vals + [0, 0, 0, 0, 0])[:5]
        msg = "IO|" + ",".join(str(int(v)) for v in padded)
        sock.sendto(msg.encode("utf-8"), addr)
        return

    if name == "GET_GRIPPER":
        # 由于 STM32 暂未反馈真实夹爪状态，返回占位值
        msg = "GRIPPER|" + ",".join(str(v) for v in [0, 0, 0, 0, 0, 0])
        sock.sendto(msg.encode("utf-8"), addr)
        return

    if name == "GET_SPEEDS":
        speeds = state.get("speeds", [])
        padded = (speeds + [0, 0, 0, 0, 0, 0])[:6]
        msg = "SPEEDS|" + ",".join(str(int(v)) for v in padded)
        sock.sendto(msg.encode("utf-8"), addr)
        return

    if name == "GET_ESTOP_STATUS":
        estop = state.get("estop", False)
        msg = "ESTOP_STATUS|" + ("1" if estop else "0")
        sock.sendto(msg.encode("utf-8"), addr)
        return

    if name == "GET_HOMED":
        homed = state.get("homed", [])
        padded = (homed + [0, 0, 0, 0, 0, 0])[:6]
        msg = "HOMED|" + ",".join(str(int(v)) for v in padded)
        sock.sendto(msg.encode("utf-8"), addr)
        return

    if name == "GET_HZ":
        hz = state.get("hz", 0.0)
        msg = f"HZ|{hz}"
        sock.sendto(msg.encode("utf-8"), addr)
        return


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        logger.info("退出 parol6_usb_bridge")
