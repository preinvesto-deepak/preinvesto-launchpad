import { useState } from "react";
import { useAppData } from "../context/AppDataContext";

function DimensionsEntry() {
  const { projects, subProjects, dimensions, setDimensions, prices } = useAppData();

  const [formData, setFormData] = useState({
    projectName: projects[0]?.name || "",
    subProjectName: "",
    itemName: "",
    materialName: "",
    length: "",
    width: "",
    height: "",
    shelves: "",
  });

  const [editId, setEditId] = useState(null);
  const [searchText, setSearchText] = useState("");

  const resetForm = () => {
    setFormData({
      projectName: projects[0]?.name || "",
      subProjectName: "",
      itemName: "",
      materialName: "",
      length: "",
      width: "",
      height: "",
      shelves: "",
    });
    setEditId(null);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name === "projectName") {
      setFormData({
        ...formData,
        projectName: value,
        subProjectName: "",
      });
      return;
    }

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleAddOrUpdateEntry = () => {
    const {
      projectName,
      subProjectName,
      itemName,
      materialName,
      length,
      width,
      height,
      shelves,
    } = formData;

    if (
      !projectName ||
      !subProjectName ||
      !itemName ||
      !materialName ||
      !length ||
      !width ||
      !height ||
      !shelves
    ) {
      alert("Please fill all fields");
      return;
    }

    if (editId) {
      const updatedEntries = dimensions.map((entry) =>
        entry.id === editId ? { ...entry, ...formData } : entry
      );
      setDimensions(updatedEntries);
    } else {
      const newEntry = {
        id: dimensions.length > 0 ? Math.max(...dimensions.map((d) => d.id)) + 1 : 1,
        ...formData,
      };
      setDimensions([...dimensions, newEntry]);
    }

    resetForm();
  };

  const handleEditEntry = (entry) => {
    setFormData({
      projectName: entry.projectName,
      subProjectName: entry.subProjectName,
      itemName: entry.itemName,
      materialName: entry.materialName,
      length: entry.length,
      width: entry.width,
      height: entry.height,
      shelves: entry.shelves,
    });
    setEditId(entry.id);
  };

  const handleDeleteEntry = (id) => {
    const updatedEntries = dimensions.filter((entry) => entry.id !== id);
    setDimensions(updatedEntries);

    if (editId === id) {
      resetForm();
    }
  };

  const filteredDimensions = dimensions.filter((entry) => {
    const value = searchText.toLowerCase();
    return (
      entry.projectName.toLowerCase().includes(value) ||
      entry.subProjectName.toLowerCase().includes(value) ||
      entry.itemName.toLowerCase().includes(value) ||
      entry.materialName.toLowerCase().includes(value)
    );
  });

  return (
    <div className="page-card">
      <h2>Dimensions Entry</h2>

      <div style={{ display: "grid", gap: "10px", maxWidth: "420px", marginBottom: "20px" }}>
        <select
          name="projectName"
          value={formData.projectName}
          onChange={handleChange}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.name}>
              {project.name}
            </option>
          ))}
        </select>

        <select
          name="subProjectName"
          value={formData.subProjectName}
          onChange={handleChange}
        >
          <option value="">Select Sub Project</option>
          {subProjects
            .filter((item) => item.project === formData.projectName)
            .map((item) => (
              <option key={item.id} value={item.subProject}>
                {item.subProject}
              </option>
            ))}
        </select>

        <input
          type="text"
          name="itemName"
          placeholder="Item Name"
          value={formData.itemName}
          onChange={handleChange}
        />

        <select
          name="materialName"
          value={formData.materialName}
          onChange={handleChange}
        >
          <option value="">Select Material</option>
          {prices.map((item) => (
  <option key={item.id} value={item.materialName}>
    {item.materialName} ({item.category || "General"})
  </option>
))}
        </select>

        <input
          type="number"
          name="length"
          placeholder="Length (ft)"
          value={formData.length}
          onChange={handleChange}
        />

        <input
          type="number"
          name="width"
          placeholder="Width / Depth (ft)"
          value={formData.width}
          onChange={handleChange}
        />

        <input
          type="number"
          name="height"
          placeholder="Height (ft)"
          value={formData.height}
          onChange={handleChange}
        />

        <input
          type="number"
          name="shelves"
          placeholder="Number of Shelves"
          value={formData.shelves}
          onChange={handleChange}
        />

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleAddOrUpdateEntry}>
            {editId ? "Update Dimensions" : "Add Dimensions"}
          </button>

          {editId && (
            <button onClick={resetForm}>
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: "420px", marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Search by project, sub project, item, or material"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <table border="1" cellPadding="10" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th>ID</th>
            <th>Project</th>
            <th>Sub Project</th>
            <th>Item</th>
            <th>Material</th>
            <th>Length (ft)</th>
            <th>Width (ft)</th>
            <th>Height (ft)</th>
            <th>Shelves</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  {filteredDimensions.length > 0 ? (
    filteredDimensions.map((entry) => (
      <tr key={entry.id}>
        <td>{entry.id}</td>
        <td>{entry.projectName}</td>
        <td>{entry.subProjectName}</td>
        <td>{entry.itemName}</td>
        <td>{entry.materialName}</td>
        <td>{entry.length}</td>
        <td>{entry.width}</td>
        <td>{entry.height}</td>
        <td>{entry.shelves}</td>
        <td style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => handleEditEntry(entry)}>Edit</button>
          <button onClick={() => handleDeleteEntry(entry.id)}>Delete</button>
        </td>
      </tr>
    ))
  ) : (
    <tr>
      <td colSpan="10">No dimensions found.</td>
    </tr>
  )}
</tbody>
      </table>
    </div>
  );
}

export default DimensionsEntry;