import api from "./api";

export const downloadModuleExcel = async (moduleCode) => {
  const response = await api.get(`/export/${encodeURIComponent(moduleCode)}`, {
    responseType: "blob",
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));

  const link = document.createElement("a");

  link.href = url;
  link.download = `${moduleCode}_Finalized.xlsx`;

  document.body.appendChild(link);

  link.click();

  link.remove();

  window.URL.revokeObjectURL(url);
};
