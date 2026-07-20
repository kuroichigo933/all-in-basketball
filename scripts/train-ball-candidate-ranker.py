#!/usr/bin/env python3
"""Train a tiny browser-safe candidate ranker from calibration ball boxes."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import torch


FEATURE_NAMES = [
    "confidence", "apparentSize", "appearanceConfidence",
    "sourceDetected", "sourceColor", "sourceMotion", "x", "y",
    "nearestWristDistance", "nearestKneeDistance", "nearestHipDistance",
    "xFromHipCenter", "yFromHipCenter", "yFromKneeCenter",
]


def parse_dataset(value: str) -> tuple[Path, Path]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("datasets must use <manifest>=<observations-directory>")
    manifest, observations = value.split("=", 1)
    return Path(manifest).resolve(), Path(observations).resolve()


def display_path(path: Path) -> str:
    try:
        return path.relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def distance(first: dict, second: dict) -> float:
    return math.hypot(first["x"] - second["x"], first["y"] - second["y"])


def center_error_radii(candidate: dict, box: dict) -> float:
    center_x = box["x"] + box["width"] / 2
    center_y = box["y"] + box["height"] / 2
    point = candidate["point"]
    return math.hypot(
        (point["x"] - center_x) / (box["width"] / 2),
        (point["y"] - center_y) / (box["height"] / 2),
    )


def features(candidate: dict, observation: dict) -> list[float]:
    wrists = [observation["leftWrist"], observation["rightWrist"]]
    knees = [observation["leftKnee"], observation["rightKnee"]]
    hips = [observation["leftHip"], observation["rightHip"]]
    hip_center = {"x": sum(point["x"] for point in hips) / 2, "y": sum(point["y"] for point in hips) / 2}
    knee_center = {"x": sum(point["x"] for point in knees) / 2, "y": sum(point["y"] for point in knees) / 2}
    point = candidate["point"]
    source = candidate["source"]
    return [
        candidate["confidence"], candidate.get("apparentSize", 0), candidate.get("appearanceConfidence", 0.5),
        float(source == "detected"), float(source == "color"), float(source == "motion"), point["x"], point["y"],
        min(distance(point, wrist) for wrist in wrists), min(distance(point, knee) for knee in knees),
        min(distance(point, hip) for hip in hips), point["x"] - hip_center["x"], point["y"] - hip_center["y"],
        point["y"] - knee_center["y"],
    ]


def load_rows(datasets: list[tuple[Path, Path]]) -> tuple[list[tuple[str, list[list[float]], list[bool]]], list[dict]]:
    rows: list[tuple[str, list[list[float]], list[bool]]] = []
    provenance: list[dict] = []
    for manifest_path, observations_directory in datasets:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        calibration = [clip for clip in manifest["clips"] if clip["split"] == "calibration"]
        if not calibration:
            raise ValueError(f"{manifest_path} has no calibration clips")
        if any(clip["split"] != "calibration" for clip in calibration):
            raise ValueError("candidate ranker training may only read calibration clips")
        provenance.append({"manifest": display_path(manifest_path), "observationsDirectory": display_path(observations_directory),
                           "clips": [clip["id"] for clip in calibration]})
        for clip in calibration:
            labels_path = manifest_path.parent / "labels" / "ball" / f"{clip['id']}.json"
            labels = json.loads(labels_path.read_text(encoding="utf-8"))["labels"]
            observations = json.loads((observations_directory / f"{clip['id']}.json").read_text(encoding="utf-8"))["observations"]
            for label in (item for item in labels if item["visibility"] == "visible"):
                observation = min(observations, key=lambda item: abs(item["timeMs"] - label["timeMs"]))
                if abs(observation["timeMs"] - label["timeMs"]) > 60:
                    continue
                candidates = observation.get("ballCandidates", [])
                errors = [center_error_radii(candidate, label["box"]) for candidate in candidates]
                if not errors or min(errors) > 1.25:
                    continue
                rows.append((clip["id"], [features(candidate, observation) for candidate in candidates],
                             [error <= 1.25 for error in errors]))
    return rows, provenance


def train(rows: list[tuple[str, list[list[float]], list[bool]]], epochs: int) -> tuple[torch.nn.Sequential, torch.Tensor, torch.Tensor, dict]:
    samples = [sample for _, frame, _ in rows for sample in frame]
    targets = [float(target) for _, _, frame_targets in rows for target in frame_targets]
    inputs = torch.tensor(samples, dtype=torch.float32)
    expected = torch.tensor(targets, dtype=torch.float32).unsqueeze(1)
    mean = inputs.mean(0)
    standard_deviation = inputs.std(0).clamp_min(0.01)
    torch.manual_seed(7)
    model = torch.nn.Sequential(torch.nn.Linear(len(FEATURE_NAMES), 32), torch.nn.ReLU(),
                                torch.nn.Linear(32, 16), torch.nn.ReLU(), torch.nn.Linear(16, 1))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.01, weight_decay=0.0001)
    positive_weight = (len(targets) - sum(targets)) / sum(targets)
    loss_function = torch.nn.BCEWithLogitsLoss(pos_weight=torch.tensor([positive_weight]))
    for _ in range(epochs):
        optimizer.zero_grad()
        loss = loss_function(model((inputs - mean) / standard_deviation), expected)
        loss.backward()
        optimizer.step()
    hits = 0
    with torch.no_grad():
        offset = 0
        scores = model((inputs - mean) / standard_deviation).squeeze(1)
        for _, frame, frame_targets in rows:
            selected = int(torch.argmax(scores[offset:offset + len(frame)]))
            hits += int(frame_targets[selected])
            offset += len(frame)
    return model, mean, standard_deviation, {
        "candidateCoveredFrames": len(rows), "top1Hits": hits, "top1Rate": hits / len(rows),
        "candidateSamples": len(targets), "positiveSamples": int(sum(targets)), "loss": float(loss),
    }


def layer(linear: torch.nn.Linear) -> dict:
    return {"weights": linear.weight.detach().tolist(), "bias": linear.bias.detach().tolist(), "activation": "relu"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", action="append", type=parse_dataset, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--epochs", type=int, default=1200)
    args = parser.parse_args()
    rows, provenance = load_rows(args.dataset)
    model, mean, standard_deviation, metrics = train(rows, args.epochs)
    artifact = {
        "schemaVersion": 1, "id": "calibrated-ball-candidate-ranker-v1", "calibrationOnly": True,
        "features": FEATURE_NAMES, "mean": mean.tolist(), "standardDeviation": standard_deviation.tolist(),
        "layers": [layer(model[0]), layer(model[2]), {**layer(model[4]), "activation": "linear"}],
        "training": {"seed": 7, "epochs": args.epochs, "provenance": provenance, "metrics": metrics},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(artifact, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output.resolve()), "metrics": metrics}, indent=2))


if __name__ == "__main__":
    main()
