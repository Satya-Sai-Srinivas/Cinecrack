# Use an official, lightweight Python 3.11 image to ensure compatibility with Langchain
FROM python:3.11-slim

# Prevent Python from writing .pyc files to disk and keep stdout unbuffered
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set the working directory inside the container
WORKDIR /app

# Copy only the requirements first to leverage Docker layer caching
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of your application code
COPY . .

# Cloud Run dynamically assigns a port via the PORT environment variable (default 8080)
ENV PORT=8080

# Expose the port
EXPOSE $PORT

# Start the FastAPI application using Uvicorn
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]