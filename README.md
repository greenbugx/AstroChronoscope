# AstroChronoscope

AstroChronoscope is a time-domain astronomical investigation platform for SPHEREx observations retrieved through NASA/IPAC IRSA. It queries multi-epoch archive observations, retrieves FITS cutouts, validates astrometric WCS solutions, performs differential image subtraction, extracts light curves, analyzes spectra, and cross-matches with Gaia DR3.

## Features

- **Observation Discovery**: Query SPHEREx observations via IRSA SIA2 cone search with metadata mapping and multi-epoch timeline generation.
- **FITS Processing**: Retrieve cutouts, extract celestial WCS solutions, and inspect HDU statistics, data flags, and PSF metrics.
- **Differential Image Analysis**: Re-project multi-epoch images onto a common sky grid and compute difference images with variance propagation.
- **Time-Domain Analysis**: Source detection, circular aperture photometry, and multi-epoch light curve generation.
- **Spectrophotometry**: 1D spectral cube extraction and cross-epoch spectral comparison with correlation and residual analysis.
- **Gaia DR3 Integration**: Cone search and astrometric cross-matching with proper motion propagation.
- **Benchmark Target Presets**: One-click configuration for NASA benchmark targets: Barnard's Star, Epsilon Indi B, WISE 0855-0714, RW Aurigae, and R Draconis.
- **Synchronous Operation Monitor**: Real-time lifecycle tracking of backend API requests with duration measurement and failure diagnostics.

## Project Structure

```text
AstroChronoscope/
├── src/                # React and TypeScript frontend
├── backend/            # FastAPI service
│   ├── app/            # API routes, services, schemas, and config
│   ├── tests/          # Pytest test suite
│   ├── storage/        # Local cache for FITS cutouts and generated previews
│   └── docs/           # Backend integration documentation
├── docs/               # In-depth system and scientific documentation
├── tests/              # Frontend unit tests
├── index.html
├── package.json
└── vite.config.ts
```

## Documentation

Detailed documentation is available in the [`docs/`](docs/) directory:

- [System Architecture](docs/ARCHITECTURE.md): Architecture overview, state flow, and archive integrations.
- [Detailed Features](docs/FEATURES.md): In-depth walkthrough of all six mission workspaces and capabilities.
- [API Reference](docs/API_REFERENCE.md): REST API contracts, endpoints, schemas, and file delivery.
- [Scientific Pipeline](docs/SCIENTIFIC_PIPELINE.md): Methodologies for WCS, differential subtraction, photometry, spectra, and Gaia cross-matching.
- [NASA Benchmark Targets](docs/BENCHMARK_TARGETS.md): Reference parameters and space-motion propagation for challenge targets.

## Getting Started

### Prerequisites

- Python 3.14 (or Python 3.11+)
- Node.js 20+
- Network access to IRSA for live queries

### Backend Setup

```bash
cd backend
cp .env.example .env

# Using uv
uv sync
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Or using pip
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive API documentation is available at `http://127.0.0.1:8000/docs`.

### Frontend Setup

```bash
# From the repository root
cp .env.example .env
npm install
npm run dev
```

The application will be available at `http://localhost:5173`.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/health` | Backend service health and default collection |
| GET | `/api/v1/telemetry` | Local storage usage and subsystem statistics |
| GET | `/api/v1/targets/timeline` | Multi-epoch observation discovery via IRSA SIA2 |
| POST | `/api/v1/observations/search` | Spatial cone search across SPHEREx archive |
| POST | `/api/v1/observations/{id}/cutout` | FITS cutout retrieval and PNG preview generation |
| POST | `/api/v1/images/inspect` | FITS header and WCS astrometry inspection |
| POST | `/api/v1/images/compare` | Multi-epoch image reprojection and difference computation |
| POST | `/api/v1/lightcurves/target` | Multi-epoch aperture photometry and light curve extraction |
| POST | `/api/v1/spectra/extract` | 1D spectral cube extraction |
| POST | `/api/v1/spectra/compare` | Cross-epoch spectral correlation and comparison |
| POST | `/api/v1/gaia/search` | Gaia DR3 cone search |
| GET | `/api/v1/gaia/sources/{id}` | Gaia DR3 source cross-match association |
| GET | `/api/v1/files/{filename}` | Download generated FITS and PNG preview files |

## Running Tests

### Frontend Tests

```bash
npm test          # Run node:test unit test suite
npm run lint      # Run oxlint
npm run build     # Verify TypeScript build and Vite bundle
```

### Backend Tests

```bash
cd backend
python -m pytest tests/
```

To run opt-in live network integration tests against IRSA:

```bash
RUN_LIVE=1 python -m pytest tests/test_live_integration.py
```

## License

See [LICENSE](LICENSE).
