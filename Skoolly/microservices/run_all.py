import os
import sys
import time
import subprocess
import threading

services = [
    ("Orchestrator", "orchestrator.py", 8000),
    ("Scraper Service", "scraper_service.py", 8001),
    ("Validator Service", "validator_service.py", 8002),
    ("Database Service", "db_service.py", 8003),
    ("OPEC Service", "opec_service.py", 8004),
]

processes = []

# Detect virtual environment Python
dir_path = os.path.dirname(os.path.abspath(__file__))
venv_candidates = [
    os.path.join(dir_path, "..", ".venv", "Scripts", "python.exe"),
    os.path.join(dir_path, "..", ".venv", "bin", "python"),
    os.path.join(dir_path, ".venv", "Scripts", "python.exe"),
    os.path.join(dir_path, ".venv", "bin", "python"),
]

python_bin = sys.executable
for candidate in venv_candidates:
    if os.path.isfile(candidate):
        python_bin = os.path.abspath(candidate)
        break

# Set environment variable to force UTF-8 for subprocesses
env = os.environ.copy()
env["PYTHONIOENCODING"] = "utf-8"

def stream_logs(service_name: str, pipe):
    try:
        for line in iter(pipe.readline, ''):
            if line:
                print(f"[{service_name}] {line.rstrip()}")
    except Exception:
        pass
    finally:
        try:
            pipe.close()
        except Exception:
            pass

try:
    print("[INFO] Starting Skoolly microservices (Saga Pattern)...")
    print(f"[INFO] Python Interpreter: {python_bin}")
    
    for name, script, port in services:
        script_path = os.path.join(dir_path, script)
        print(f"  -> Starting {name} on port {port}...")
        p = subprocess.Popen(
            [python_bin, script_path],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=env,
            creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
        )
        processes.append((name, p))
        
        # Start log streamer thread
        t = threading.Thread(target=stream_logs, args=(name, p.stdout), daemon=True)
        t.start()
        
        time.sleep(1.0)

    print("\n[SUCCESS] All microservices started successfully! Press Ctrl+C to terminate.")
    print("Saga Orchestrator is listening at: http://localhost:8000")
    print("OPEC Service is listening at:      http://localhost:8004")
    print("----------------------------------------------------------------------")

    # Monitor processes
    while True:
        for name, p in processes:
            ret = p.poll()
            if ret is not None:
                print(f"[ERROR] Service {name} terminated unexpectedly with code {ret}.")
                sys.exit(1)
        time.sleep(1)

except KeyboardInterrupt:
    print("\n[INFO] Shutting down all microservices...")
    for name, p in processes:
        print(f"  -> Stopping {name}...")
        try:
            p.terminate()
            p.wait(timeout=3)
        except Exception:
            p.kill()
    print("[INFO] Shutdown complete.")

