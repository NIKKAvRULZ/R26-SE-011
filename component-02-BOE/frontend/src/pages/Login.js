import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { login } from "../services/authService";
import { saveUser } from "../utils/auth";

import "./Login.css";

export default function Login() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");

  const [password, setPassword] = useState("");

  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();

    setError("");

    try {
      const data = await login(username, password);

      saveUser(data);

      navigate("/dashboard");
    } catch {
      setError("Invalid username or password");
    }
  };

  return (
    <div className="login-container">
      <form className="login-card" onSubmit={handleLogin}>
        <h2>BOA Login</h2>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && <p>{error}</p>}

        <button type="submit">Login</button>
      </form>
    </div>
  );
}
