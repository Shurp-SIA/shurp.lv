FROM python:3.13-slim
WORKDIR /app
ENV FORWARDED_ALLOW_IPS=""
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY server ./server
COPY public ./public
RUN useradd --system --uid 10001 shurp && chown -R shurp:shurp /app
USER shurp
EXPOSE 8094
CMD ["uvicorn", "server.app:app", "--host", "0.0.0.0", "--port", "8094", "--proxy-headers", "--no-access-log"]
