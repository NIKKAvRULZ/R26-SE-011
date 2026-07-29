export const saveUser = (data) => {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user", JSON.stringify(data.user));
};

export const getToken = () => {
  return localStorage.getItem("token");
};

export const getUser = () => {
  return JSON.parse(localStorage.getItem("user"));
};

export const logout = () => {
  localStorage.clear();
};

export const isAuthenticated = () => {
  return !!localStorage.getItem("token");
};
