import api from "./api";

// =======================================
// DOWNLOAD RESULTS BY MODULE
// =======================================

export const downloadModuleExcel = async (moduleCode) => {
  if (!moduleCode) {
    throw new Error("Module code is required.");
  }

  const normalizedModuleCode = moduleCode.trim().toUpperCase();

  const response = await api.get(
    `/export/${encodeURIComponent(normalizedModuleCode)}`,
    {
      responseType: "blob",
    },
  );

  // =======================================
  // CREATE DOWNLOAD URL
  // =======================================

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = window.URL.createObjectURL(blob);

  // =======================================
  // CREATE DOWNLOAD LINK
  // =======================================

  const link = document.createElement("a");

  link.href = url;
  link.download = `${normalizedModuleCode}_Results.xlsx`;

  document.body.appendChild(link);

  link.click();

  // =======================================
  // CLEANUP
  // =======================================

  link.remove();

  window.URL.revokeObjectURL(url);
};