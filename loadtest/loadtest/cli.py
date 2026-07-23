"""Punto de entrada: `python -m loadtest run <escenario> [flags]` /
`python -m loadtest compare <summary.json...>`. Ver `loadtest/README.md` para el
listado completo de comandos por escenario.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

from loadtest.config import add_common_arguments, build_run_config
from loadtest.report import generate_report
from loadtest.scenarios import SCENARIOS


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="loadtest",
        description="RematAR -- entorno de pruebas de carga y rendimiento (Épica 8, Módulo 8.2).",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Correr un escenario de carga")
    run_subparsers = run_parser.add_subparsers(dest="scenario", required=True)
    for name, module in SCENARIOS.items():
        scenario_parser = run_subparsers.add_parser(name, help=module.DESCRIPTION)
        add_common_arguments(scenario_parser)
        module.add_arguments(scenario_parser)

    compare_parser = subparsers.add_parser(
        "compare", help="Generar comparison.html a partir de varios summary.json"
    )
    compare_parser.add_argument("summaries", nargs="+", help="Rutas a summary.json de corridas previas")
    compare_parser.add_argument(
        "--output-dir",
        default=None,
        help="Directorio de salida (default: results/comparison_<timestamp>/)",
    )

    return parser


async def _run_scenario(args: argparse.Namespace) -> int:
    module = SCENARIOS[args.scenario]
    config = build_run_config(args)
    print(f"[loadtest] corriendo escenario '{args.scenario}' contra {config.host} ...")
    started = time.time()
    summary = await module.run(config, args)
    elapsed = time.time() - started

    timestamp = time.strftime("%Y%m%d-%H%M%S")
    output_dir = config.results_dir / f"{args.scenario}_{timestamp}"
    summary_path, report_path = generate_report(summary, output_dir)

    print(f"[loadtest] corrida terminada en {elapsed:.1f}s")
    print(f"[loadtest] summary: {summary_path}")
    print(f"[loadtest] reporte: {report_path}")
    return 0


def _run_compare(args: argparse.Namespace) -> int:
    from loadtest.compare import load_summaries, write_comparison_report

    summaries = load_summaries([Path(p) for p in args.summaries])
    output_dir = (
        Path(args.output_dir)
        if args.output_dir
        else Path("results") / f"comparison_{time.strftime('%Y%m%d-%H%M%S')}"
    )
    report_path = write_comparison_report(summaries, output_dir)
    print(f"[loadtest] comparación generada: {report_path}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command == "run":
        return asyncio.run(_run_scenario(args))
    if args.command == "compare":
        return _run_compare(args)
    parser.error(f"comando desconocido: {args.command}")
    return 2  # pragma: no cover -- parser.error ya termina el proceso


if __name__ == "__main__":
    sys.exit(main())
