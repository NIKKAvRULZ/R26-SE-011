import axios from "axios";
import { getToken } from "../utils/auth";

const API = "http://localhost:5000/api";

export const getDashboard = async () => {
  const response = await axios.get(
    `${API}/dashboard`,

    {
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    },
  );

  return response.data;
};
