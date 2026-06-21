# Talvion Backend API

This is the production-ready Node.js & Express.js backend API for the **Talvion** social media app. It implements a highly structured, scalable MVC architecture suitable for real-time and restful data fetching.

---

## Technical Stack
- **Node.js** & **Express.js** (API Framework)
- **MongoDB** & **Mongoose** (Database Layer)
- **Helmet** (HTTP Header Security)
- **Morgan** (Request Logging)
- **JWT** & **BcryptJS** (Secure Authentication)

---

## Folder Architecture
- `src/config/`: Environment configuration loaders and DB drivers.
- `src/controllers/`: Route handlers to map incoming HTTP payloads.
- `src/middlewares/`: Global guards (Auth validators, exception catchers).
- `src/models/`: Object-Schema mappers for database collections.
- `src/routes/`: Route structures and endpoints mappings.
- `src/services/`: Reusable database read/write queries.
- `src/utils/`: Common helpers (custom loggers, formatters).

---

## Quick Start Setup

### 1. Prerequisites
- **Node.js** (v18+ recommended)
- **npm** (v9+)
- **MongoDB** (running locally or via docker-compose at root)

### 2. Installation
Navigate into the backend directory and install dependencies:
```bash
npm install
```

### 3. Environment Setup
Copy the template `.env.example` to create your active environment config `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell, use `Copy-Item .env.example .env`)*

### 4. Running Development Server
Run the API server with nodemon reload:
```bash
npm run dev
```
The server will bind to port `5000` (or your defined `PORT` key) and output successful startup connection summaries in terminal logs.

---

## Active Endpoint Routes
- **Health Check**: `GET /health`
- **Mock Login**: `POST /api/v1/auth/login`
- **Mock Sign-Up**: `POST /api/v1/auth/signup`
- **Mock Post Feed**: `GET /api/v1/posts`
