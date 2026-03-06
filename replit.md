# Overview

WOW Wardrobe UI is a modern web application for managing a personal wardrobe and AI-powered outfit planning. Built with React and Vite, it features "Tina" - an AI stylist that builds complete outfits. The homepage centers on a "Style This Piece" experience where users upload one clothing item and Tina builds a full outfit around it. The application integrates with Firebase for authentication/storage and a separate backend for AI styling.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **React 18** with functional components and hooks
- **Vite** as the build tool with static deployment (npm run build → dist/)
- **CSS** with separate stylesheets (App.css, Wardrobe.css, Planner.css)
- **PWA** features with service worker and manifest

## Homepage - "Style This Piece" Flow
1. User uploads/photographs one clothing item they want to wear
2. User picks an occasion (Smart Casual, Work, Date, Dinner, Festive, Party, etc.)
3. Weather is auto-detected via geolocation + OpenStreetMap Nominatim API
4. Image is uploaded to Firebase Storage, sent to `/auto-tag` for detection
5. Item is auto-saved to user's wardrobe via `POST /wardrobe`
6. Full wardrobe + staples + detected item sent to `/suggest-outfit` with anchor constraint
7. Tina returns outfit with styling tips considering body shape and complexion
8. User can save to plan or try a different look

## Key State (App.jsx)
- `heroFile`, `heroPreview` - The uploaded piece
- `heroOccasion` - Selected occasion (default: "Smart Casual")
- `heroLoading` - Processing state
- `heroResult` - The outfit suggestion from Tina
- `heroDetectedItem` - The auto-tagged item info

## Backend (separate Replit app)
- Base URL: `https://wow-wardrobe-backend-himjabehl.replit.app`
- `POST /auto-tag` - Detect clothing item from image
- `POST /wardrobe` - Save item to user's wardrobe
- `GET /wardrobe?uid=` - Fetch user's wardrobe
- `POST /suggest-outfit` - AI outfit suggestion (accepts constraints, profile, wardrobe)
- `POST /plan-outfit` - Save outfit to daily plan
- `GET /staples?gender=&uid=` - Fetch staple items

## Authentication
- **Firebase Auth** with Google OAuth
- In-app browser detection (WhatsApp, Instagram) shows alert to open in regular browser

## Firebase Config
- Project: wowapp1406
- Storage bucket: `wowapp1406.firebasestorage.app`
- CORS configured for cross-origin uploads

## Key Files
- `src/App.jsx` - Main app with all state, routing, and business logic
- `src/HomeDashboard.jsx` - Homepage "Style This Piece" component
- `src/firebase.js` - Firebase configuration
- `src/App.css` - Main styles
- `src/Wardrobe.css` - Wardrobe grid styles

## External Dependencies
- **Firebase** (Auth, Firestore, Storage)
- **React** (v18), **React Router DOM**, **Vite** (v5)
- **Fabric.js** - Canvas-based image editing
- **React Calendar** - Outfit planning calendar
- **Lucide React** - Icons

## Deployment
- Static site on Replit (serves from dist/)
- Build: `npm run build`
- Dev: `npm run dev -- --host 0.0.0.0 --port 5000`
