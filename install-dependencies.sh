#!/bin/bash
# Script to install dependencies for Email Attachment Renamer project

echo "Installing project dependencies..."
npm install

echo "Installing function dependencies..."
cd netlify/functions
npm install

echo "All dependencies installed successfully!"

# Return to the project root
cd ../..

echo "Ready to deploy to Netlify!" 