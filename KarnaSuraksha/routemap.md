# Hyperlocal Disease Surveillance Project – Route Map

This markdown file provides a concise overview of the project layout, highlighting the key components and how they interact. It is intended as a quick reference for developers and stakeholders.

---

## Top‑level folders

- **backend/** – Python/Node API, data ingestion, database, and business logic.  It exposes REST/GraphQL endpoints used by the front end.
- **frontend/public/** – Static assets served by Vite: `index.html`, favicon, and environment config files.
- **frontend/src/** – Vue/React/other JS framework implementation (depending on repo emitter). Contains pages, components, store, and utilities.
- **node_modules/** – Dependencies managed by `package.json`.
- **backend/.env** – Environment variables for DB connection, API keys, etc.
- **backend/requirements.txt** – Python dependencies (if a Python server is used).
- **frontend/package.json** – Front–end npm dependencies and scripts.
- **vite.config.js** – Vite configuration.
- **eslint.config.js** – ESLint configuration for linting.
- **README.md** – Project documentation and build instructions.
- **.gitignore** – Specifies files to ignore in Git.

## Backend

```
backend/
 ├─ app.py (or server.js)
 ├─ routes/
 ├─ models/
 ├─ services/
 ├─ utils/
 ├─ config/
 └─ tests/
```

- **app.py / server.js** – Entry point that starts the server and registers routes.
- **routes/** – HTTP route handlers (e.g., `/api/cases`, `/api/alerts`).
- **models/** – ORM models for the disease surveillance database.
- **services/** – Business‑logic layer, data aggregation, and third‑party integrations.
- **utils/** – Helpers, logging, and configuration parsers.
- **config/** – Configuration files for different environments.
- **tests/** – Integration and unit tests.

## Front‑end

```
public/
 ├─ index.html
 ├─ favicon.ico
 └─ assets/ (images, icons)

src/
 ├─ main.js (or main.ts)
 ├─ router.js
 ├─ store.js
 ├─ components/
 ├─ views/
 ├─ services/
 └─ utils/
```

- **main.js** – Bootstrap file that mounts the root component.
- **router.js** – Client‑side routing (VueRouter / React Router).
- **store.js** – State management (Vuex / Redux). 
- **components/** – Reusable UI elements.
- **views/** – Page‑level components.
- **services/** – API calls to the backend.
- **utils/** – Utility functions, constants.

## Build & Run

```bash
# Install dependencies
git clone <repo-url>
cd Hyperlocal_Disease_Surveillance_FullStack_moni
npm install

# Run backend (example: python or node)
# Python
echo "export FLASK_APP=backend/app.py" > .env
flask run

# Node
npm run dev
```

For production deployment, run build scripts and configure the reverse proxy.

---

**Further Reading**
- See `README.md` for detailed setup, environment variables, and testing instructions.
- Documentation for API endpoints resides in `/backend/docs` (if using Swagger/OpenAPI).
- Front‑end routing schema and state diagram can be found in `/FrontendDocs` if present.
