# CrabFarm Project - Complete Setup Guide

## ✅ What's Completed

### Frontend
- ✓ React with React Router navigation
- ✓ Home page with hero section
- ✓ Products page with product listing
- ✓ Contact form with backend integration
- ✓ Shopping cart with localStorage persistence
- ✓ Responsive navbar with navigation
- ✓ Google Fonts integrated
- ✓ Professional styling with brand colors

### Backend
- ✓ Express API server running on port 5000
- ✓ CORS enabled for frontend
- ✓ API endpoints for orders, contact, customers
- ✓ Database connection setup ready

---

## ⚠️ Still Need to Setup: PostgreSQL Database

Before the full application works, you need to setup PostgreSQL.

### Step 1: Install PostgreSQL

**Windows:**
1. Download from: https://www.postgresql.org/download/windows/
2. Run installer and remember your password
3. pgAdmin 4 will be installed automatically

### Step 2: Create the Database

Open a Command Prompt/PowerShell and run:

```bash
psql -U postgres -c "CREATE DATABASE crabfarm_db;"
```

When prompted, enter your PostgreSQL password.

### Step 3: Load the Database Schema

```bash
psql -U postgres -d crabfarm_db -f schema.sql
```

This creates all the tables the backend needs.

### Step 4: Update Backend .env (if needed)

The `.env` file has been created with default values:
- DB_USER: postgres
- DB_PASSWORD: postgres (change if different)
- DB_NAME: crabfarm_db

Edit `crabfarm-backend/.env` if your PostgreSQL password is different.

---

## 🚀 Running the Application

### Terminal 1: Backend Server
```bash
cd crabfarm-backend
npm start
# Runs on http://localhost:5000
```

### Terminal 2: Frontend Dev Server
```bash
cd crabfarm-backend/crabfarm-frontend
npm start
# Runs on http://localhost:3000
```

---

## 📋 Project Structure

```
crabfarm-backend/
├── server.js                 # Express API
├── db.js                     # PostgreSQL connection
├── schema.sql                # Database schema
├── package.json              # Backend dependencies
├── .env                      # Environment variables
│
└── crabfarm-frontend/
    └── src/
        ├── components/       # Navbar, etc.
        ├── pages/            # Home, Products, Contact, Cart
        ├── context/          # Cart state management
        ├── services/         # API calls
        ├── App.js            # Main app with routing
        └── index.js          # React entry point
```

---

## 🎨 Features Included

✅ **Shopping Cart**
- Add/remove items
- Adjust quantities
- Persistent storage (localStorage)
- Cart summary with taxes & delivery

✅ **Product Page**
- Display mock products (ready for database)
- Add to cart functionality
- Responsive grid layout

✅ **Contact Form**
- Name, phone, inquiry type, message
- Form validation
- Connects to backend API
- Success/error messages

✅ **Navigation**
- React Router for seamless page transitions
- Navbar with cart count badge
- Home, Products, Contact, Cart pages

✅ **Backend API**
- POST /api/orders - Create orders
- GET /api/orders - Get all orders
- POST /api/contact - Submit contact form
- GET /api/contact-submissions - Get submissions

---

## 🔧 Troubleshooting

### Backend fails to start
**Error:** "Cannot find module 'express'"
- Run: `npm install` in crabfarm-backend/

**Error:** "Database connection failed"
- Make sure PostgreSQL is installed and running
- Check .env credentials match your DB setup
- Run schema.sql to create tables

### Frontend doesn't load styles
**Error:** "Fonts not loading"
- This is fixed! Google Fonts are now in public/index.html

### Cart not persisting
- Make sure localStorage is enabled in browser
- Check browser console for errors

---

## 📞 Support

For issues:
1. Check browser console for errors (F12)
2. Check backend terminal for API errors
3. Ensure PostgreSQL database is running
4. Verify .env credentials are correct

---

## 🎯 Next Steps

After setup:
1. Test the shopping cart
2. Fill a contact form
3. (Once DB is ready) Create an order via checkout
4. View orders in backend API

Happy shopping! 🦀
