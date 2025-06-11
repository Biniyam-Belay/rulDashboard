# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Set the working directory in the container
WORKDIR /app

# Copy the requirements file into the container at /app
COPY requirements.txt .

# Install any needed packages specified in requirements.txt
# Using --no-cache-dir to reduce image size
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy the app directory (containing main.py and model files) into the container at /app
COPY ./app ./app

# Make port 8001 available to the world outside this container
EXPOSE 8001

# Define environment variable for the port (optional, but good practice)
ENV PORT 8001

# Run app.main:app when the container launches
# Use 0.0.0.0 to allow connections from outside the container
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
