# 🏥 MediStore Backend API

<p align="center">
  <img src="https://placehold.co/1200x400/000000/FFFFFF?text=MediStore+Backend+Infrastructure" alt="MediStore Backend Banner" width="100%" />
</p>

### A production-grade, modular backend system designed for scalable pharmacy and marketplace applications.

[![Tech Stack](https://img.shields.io/badge/Stack-Node.js%20%7C%20Express%20%7C%20TypeScript-blue)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/Database-PostgreSQL%20%7C%20Prisma-indigo)](https://www.prisma.io/)
[![Auth](https://img.shields.io/badge/Auth-Better--Auth-orange)](https://www.better-auth.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Status](https://img.shields.io/badge/Status-Production--Ready-brightgreen)]()

---

## 🚀 Why This Backend?

Modern pharmacy systems require more than just simple data storage. They demand a **critical infrastructure layer** capable of handling complex real-world workflows.

This backend is not just an API layer—it is a **scalable foundation** designed from the ground up to handle:
- **Inventory Synchronization**: Real-time stock management with atomic consistency.
- **Secure Transactional Flow**: Ensuring order integrity through database-level transactions.
- **Multi-Role Orchestration**: Granular access control for Customers, Sellers, and Admins.
- **Reliable Data Auditing**: Soft-delete strategies and referential integrity for business safety.

---

## 📌 Project Overview

**MediStore Backend** provides the secure, modular, and high-performance engine powering the MediStore ecosystem. Built with **Node.js, Express, and TypeScript**, it leverages the **Prisma ORM** to deliver an enterprise-grade developer experience and robust system stability.

- **Purpose**: Powering a multi-seller medicine marketplace.
- **Engineering Focus**: Modularity, Type-safety, and Data Integrity.
- **Target Audience**: Professional developers, system architects, and hiring managers.

---

## 🧠 System Design Highlights

This system implements modern backend patterns to ensure long-term maintainability and scalability:

- **Layered Architecture**: Strict separation of concerns (Route → Middleware → Controller → Service → Data).
- **Controller-Service Pattern**: Fat services for complex business logic, thin controllers for I/O mapping.
- **Transaction-Safe Operations**: Guarantees atomic writes for critical workflows like order placement.
- **Centralized Error Handling**: A unified mapping system for Prisma, Zod, and custom application errors.
- **Role-Based Access Control (RBAC)**: Enforced via high-order middleware layers.

---

## 🏗️ Architecture & Request Lifecycle

The API follows a decoupled, modular design where each feature (Users, Orders, Medicines) operates within its own domain while sharing centralized cross-cutting concerns.

### Request Lifecycle Flow

```mermaid
graph TD
    A[Client Request] --> B[Route Layer]
    B --> C{Middleware Layer}
    C -->|JWT/Auth| D[Controller Layer]
    C -->|Zod Validation| D
    D --> E[Service Layer]
    E --> F[Prisma ORM]
    F --> G[(PostgreSQL DB)]
    G --> F
    F --> E
    E --> D
    D --> H[Standardized Response]
```

1.  **Route Layer**: Entry point for HTTP requests; delegates to specific domain controllers.
2.  **Middleware Layer**: Enforces "Defense-in-depth" via **Better Auth** session checks and **Zod** schema validation.
3.  **Controller Layer**: Handles request parsing, query extraction, and maps results to standardized response formats.
4.  **Service Layer**: The **Business Logic Hub**. This is where calculations, status transitions, and complex decisions happen.
5.  **Prisma Layer**: Orchestrates type-safe database queries and manages relational mappings.
6.  **Database Layer**: PostgreSQL serves as the source of truth, utilizing foreign key constraints and optimized indexing.

---

## 🗄️ Database Design & Strategy

The data layer is engineered for reliability and SEO-readiness:

- **Relational Integrity**: Strong foreign key relationships between Users, Categories, Medicines, and Orders.
- **Soft Delete Strategy**: Critical records use a `deletedAt` flag instead of hard deletion to preserve historical data.
- **Slug-Based Uniqueness**: Medicines and Categories utilize unique URL-safe slugs for superior SEO and readable URLs.
- **Optimized Indexing**: Database indexes are applied to frequently searched fields (e.g., category slug, user email) for high-speed retrieval.

---

## 📚 API Documentation

**Base URL**: `/api/v1`  
*Versioning ensures backward compatibility during system evolution.*

### 🛒 Order Management
| Method | Route | Role | Status | Description |
| :--- | :--- | :---: | :---: | :--- |
| `POST` | `/orders` | `CUSTOMER` | 201 | Creates a new atomic order. |
| `GET` | `/orders` | `USER` | 200 | Lists order history with pagination. |
| `PATCH`| `/admin/orders/:id` | `ADMIN` | 200 | Updates order/payment status. |

**Example Request (`POST /api/v1/orders`)**:
```json
{
  "shippingAddress": "123 Health St, Digital City",
  "items": [{ "medicineId": "med_abc123", "quantity": 2 }]
}
```

**Example Response**:
```json
{
  "success": true,
  "message": "Order placed successfully",
  "data": { "id": "ord_xyz789", "status": "PLACED", "totalAmount": 45.99 }
}
```

### 💊 Medicine Marketplace
| Method | Route | Role | Status | Description |
| :--- | :--- | :---: | :---: | :--- |
| `GET` | `/medicines` | `PUBLIC` | 200 | Search & filter medicines (Paginated). |
| `POST` | `/medicines` | `SELLER` | 201 | List a new medicine for sale. |
| `PUT` | `/medicines/:id`| `OWNER` | 200 | Update medicine details/stock. |

---

## 🔐 Security Architecture

We adopt a **Defense-in-depth** approach to protect system resources:

- **Session Management**: Powered by **Better Auth** with HTTP-only, secure cookies.
- **Role Validation**: Mandatory role-based middleware for all protected routes.
- **Input Sanitization**: 100% of incoming data is validated against **Zod** schemas.
- **Error Privacy**: Production mode hides internal stack traces and Prisma-specific errors from clients.
- **Transaction Safety**: Atomic `prisma.$transaction` locks ensure no "Double Spending" of inventory.

---

## 📈 Scalability & Performance

- **Stateless API**: Designed for horizontal scaling across multiple container instances.
- **Efficient Querying**: Leverages Prisma's `include` and `select` to prevent N+1 query problems.
- **Developer Experience (DX)**: Full TypeScript isolation and modularity Allow for easy microservices migration.
- **Roadmap**: Planned integration of **Redis** for category/search caching and **BullMQ** for async notification processing.

---

## 🔄 Data Integrity: Atomic Transactions

Partial failures are catastrophic in pharmacy apps. Our order creation flow guarantees consistency:

```typescript
const result = await prisma.$transaction(async (tx) => {
  // 1. Atomically decrement stock for all items
  // 2. Validate stock levels during the update
  // 3. Create order record linked to items
  // 4. Return formatted order with relations
});
```
*If any step fails, the entire request rolls back, ensuring stock counts remain perfectly synced.*

---

## ⚠️ Error Handling Strategy

MediStore uses a centralized workflow to transform complex internal failures into predictable API responses:

1.  **Occurrence**: A Prisma validation or business logic error is thrown.
2.  **Mapping**: A specialized helper (e.g., `handlePrismaErrors`) catches and normalizes the error.
3.  **AppError**: The system wraps it in a consistent `AppError` structure.
4.  **Global Handler**: Final middleware catches all errors and returns a standardized JSON response.

**Standard Error Format**:
```json
{
  "success": false,
  "statusCode": 400,
  "message": "Validation Error",
  "errorSources": [{ "path": "items.0.quantity", "message": "Must be greater than 0" }]
}
```

---

## 🛠 Tech Stack

| Category | Technology | Rationale |
| :--- | :--- | :--- |
| **Runtime** | **Node.js** | High-performance, event-driven I/O. |
| **Language** | **TypeScript** | Strict typing for robust enterprise applications. |
| **Framework** | **Express.js** | Industry-standard flexibility and middleware ecosystem. |
| **ORM** | **Prisma** | Type-safe modeling and elite developer productivity. |
| **Database** | **PostgreSQL** | Reliable relational storage with ACID compliance. |
| **Validation**| **Zod** | Schema-first validation for end-to-end type safety. |
| **Auth** | **Better Auth** | Modern, secure authentication with managed sessions. |
| **Storage** | **Cloudinary** | Global CDN for lightning-fast medicine image delivery. |

---

## 🌍 Deployment & Pipeline

- **Hosting**: Backend deployed as a Node.js service on **Render**.
- **Database**: Managed **PostgreSQL** (Neon) for high availability.
- **Deployment Strategy**: Environment-based configuration (Development vs. Production) for secure secret management.

---

## 📥 Installation & Local Setup

### Prerequisites
- Node.js `v18+`
- pnpm `v10+` (or npm/yarn)
- PostgreSQL Database

### 1. Clone & Install
```bash
git clone https://github.com/ArnabSaga/MediStore-Backend.git
cd medistore-backend
pnpm install
```

### 2. Configure Environment
Create a `.env` file using `.env.example`:
```env
DATABASE_URL="postgresql://user:pass@localhost:5432/medistore"
BETTER_AUTH_SECRET="your_secret"
APP_URL="http://localhost:3000"
```

### 3. Database Migration
```bash
pnpm prisma migrate dev
pnpm prisma generate
```

### 4. Admin Seeding (Optional)
```bash
pnpm run seed:admin
```

### 5. Start Development
```bash
pnpm dev
```

---

## 📁 Folder Structure

```bash
src/
 ┣ app/
 ┃ ┣ config/        # Environment & App config
 ┃ ┣ middleware/    # Auth, Validation, Error handlers
 ┃ ┣ modules/       # Domain-driven features (Users, Orders, etc.)
 ┃ ┃ ┗ [module]/    # controller.ts, service.ts, route.ts, validation.ts
 ┃ ┣ utils/         # Standardized formatters & helpers
 ┃ ┗ app.ts         # App initialization logic
 ┣ prisma/          # Schema & Migrations
 ┗ server.ts        # Server entry point
```

---

## 🛣️ Future Roadmap

- [ ] **Swagger/OpenAPI**: Interactive visual API documentation.
- [ ] **Redis Caching**: Caching for frequently accessed medicine listings.
- [ ] **Notification Service**: Webhook-based or Email alerts for order delivery.
- [ ] **Payment Integration**: Stripe/SSLCommerz for real-time payments.

---

## 🤝 Contributing & Feedback

If you are interested in backend architecture or system design:

- ⭐ **Star the repository** to show your support.
- 🧠 **Share feedback** via GitHub issues.
- 🔧 **Contribute improvements** through Pull Requests.

**Let’s build scalable and reliable systems together.**

---
**Made with ❤️ by ArnabSaga**
