"""
Motion Recording Module for PAROL6 Robot

Records commanded vs actual joint positions during execution for
motion comparison analysis and debugging discrepancies.

Author: PAROL6 Team
Date: 2025-01-28
"""

import time
import json
import logging
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass
class MotionSample:
    """Single motion sample capturing position_out vs position_in"""
    timestamp_ms: float              # ms since recording start
    position_out: List[float]        # [J1-J6] degrees - what commander sends to motors
    position_in: List[float]         # [J1-J6] degrees - feedback from robot


class MotionRecorder:
    """
    Records commanded vs actual joint positions during robot execution.

    Captures at configurable sample rate (default 20Hz) without
    impacting the 100Hz control loop by self-throttling.

    Data sources:
    - position_out: What commander sends to motors each cycle (target)
    - position_in: What robot reports back via serial (feedback)
    """

    def __init__(self,
                 logger: logging.Logger,
                 sample_rate_hz: int = 20,
                 recordings_dir: Path = None,
                 steps2deg_func = None):
        """
        Initialize motion recorder.

        Args:
            logger: Logger instance
            sample_rate_hz: Sample capture rate (default 20Hz, max 50Hz recommended)
            recordings_dir: Directory to save recordings (default: motion_recordings/)
            steps2deg_func: Function to convert steps to degrees: (steps, joint_index) -> degrees
        """
        self.logger = logger
        self.sample_rate_hz = min(sample_rate_hz, 50)  # Cap at 50Hz
        self.sample_interval_ms = 1000.0 / self.sample_rate_hz
        self.recordings_dir = recordings_dir or Path("motion_recordings")
        self.steps2deg_func = steps2deg_func

        # Recording state
        self._is_recording = False
        self._recording_name: Optional[str] = None
        self._recording_start_time: Optional[float] = None
        self._last_sample_time_ms: float = 0
        self._samples: List[MotionSample] = []

        # Maximum samples to prevent runaway memory usage (10 min at 50Hz)
        self._max_samples = 30000

    def start_recording(self, name: Optional[str] = None) -> bool:
        """
        Start a new motion recording session.

        Args:
            name: Optional recording name (auto-generated if not provided)

        Returns:
            True if recording started, False if already recording
        """
        if self._is_recording:
            self.logger.warning("[MotionRecorder] Already recording, stop first")
            return False

        import datetime
        self._recording_name = name or f"motion_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self._recording_start_time = time.time()
        self._last_sample_time_ms = 0
        self._samples = []
        self._is_recording = True

        self.logger.info(f"[MotionRecorder] Started recording: {self._recording_name} @ {self.sample_rate_hz}Hz")
        return True

    def stop_recording(self) -> Optional[Dict[str, Any]]:
        """
        Stop recording and return the recorded data.

        Returns:
            Recording data dict with metadata and samples, or None if not recording
        """
        if not self._is_recording:
            return None

        self._is_recording = False
        duration_s = time.time() - self._recording_start_time if self._recording_start_time else 0

        import datetime
        recording = {
            "metadata": {
                "name": self._recording_name,
                "timestamp": datetime.datetime.now().isoformat(),
                "sample_rate_hz": self.sample_rate_hz,
                "duration_s": round(duration_s, 3),
                "num_samples": len(self._samples)
            },
            "commander_state": [asdict(s) for s in self._samples]
        }

        self.logger.info(f"[MotionRecorder] Stopped recording: {len(self._samples)} samples, {duration_s:.2f}s")

        # Clear internal state
        samples_data = recording
        self._samples = []
        self._recording_name = None
        self._recording_start_time = None

        return samples_data

    def maybe_capture_sample(self, position_out: List[int], position_in: List[int]) -> bool:
        """
        Capture a sample if enough time has elapsed since last sample.
        Call this every control loop cycle - it will self-throttle.

        Args:
            position_out: Commanded positions in steps (6 joints)
            position_in: Feedback positions in steps (6 joints)

        Returns:
            True if sample was captured, False otherwise
        """
        if not self._is_recording:
            return False

        # Check if we've hit max samples
        if len(self._samples) >= self._max_samples:
            self.logger.warning("[MotionRecorder] Max samples reached, auto-stopping")
            self.stop_recording()
            return False

        # Calculate elapsed time
        now = time.time()
        elapsed_since_start_ms = (now - self._recording_start_time) * 1000
        elapsed_since_last = elapsed_since_start_ms - self._last_sample_time_ms

        # Check sample interval
        if elapsed_since_last < self.sample_interval_ms:
            return False

        # Convert steps to degrees
        if self.steps2deg_func:
            pos_out_deg = [
                float(self.steps2deg_func(position_out[i], i))
                for i in range(min(6, len(position_out)))
            ]
            pos_in_deg = [
                float(self.steps2deg_func(position_in[i], i))
                for i in range(min(6, len(position_in)))
            ]
        else:
            # Fallback: just use raw values (not ideal but prevents crash)
            pos_out_deg = [float(p) for p in position_out[:6]]
            pos_in_deg = [float(p) for p in position_in[:6]]

        # Create and store sample
        sample = MotionSample(
            timestamp_ms=round(elapsed_since_start_ms, 2),
            position_out=pos_out_deg,
            position_in=pos_in_deg
        )

        self._samples.append(sample)
        self._last_sample_time_ms = elapsed_since_start_ms

        return True

    @property
    def is_recording(self) -> bool:
        """Check if currently recording."""
        return self._is_recording

    @property
    def sample_count(self) -> int:
        """Get current sample count."""
        return len(self._samples)

    @property
    def recording_duration_s(self) -> float:
        """Get current recording duration in seconds."""
        if not self._is_recording or not self._recording_start_time:
            return 0
        return time.time() - self._recording_start_time
