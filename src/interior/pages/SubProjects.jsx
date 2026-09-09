import { useState } from "react";
import { useAppData } from "../context/AppDataContext";

function SubProjects() {
  const { projects, subProjects, setSubProjects } = useAppData();

  const [projectName, setProjectName] = useState(projects[0]?.name || "");
  const [subProjectName, setSubProjectName] = useState("");
  const [roomType, setRoomType] = useState("");
  const [editId, setEditId] = useState(null);
  const [searchText, setSearchText] = useState("");

  const resetForm = () => {
    setProjectName(projects[0]?.name || "");
    setSubProjectName("");
    setRoomType("");
    setEditId(null);
  };

  const handleAddOrUpdateSubProject = () => {
    if (!projectName || !subProjectName || !roomType) {
      alert("Please fill all fields");
      return;
    }

    if (editId) {
      const updatedSubProjects = subProjects.map((item) =>
        item.id === editId
          ? {
              ...item,
              project: projectName,
              subProject: subProjectName,
              roomType: roomType,
            }
          : item
      );
      setSubProjects(updatedSubProjects);
    } else {
      const newSubProject = {
        id: subProjects.length > 0 ? Math.max(...subProjects.map((s) => s.id)) + 1 : 1,
        project: projectName,
        subProject: subProjectName,
        roomType: roomType,
      };

      setSubProjects([...subProjects, newSubProject]);
    }

    resetForm();
  };

  const handleEditSubProject = (item) => {
    setProjectName(item.project);
    setSubProjectName(item.subProject);
    setRoomType(item.roomType);
    setEditId(item.id);
  };

  const handleDeleteSubProject = (id) => {
    const updatedSubProjects = subProjects.filter((item) => item.id !== id);
    setSubProjects(updatedSubProjects);

    if (editId === id) {
      resetForm();
    }
  };

  const filteredSubProjects = subProjects.filter((item) => {
    const value = searchText.toLowerCase();
    return (
      item.project.toLowerCase().includes(value) ||
      item.subProject.toLowerCase().includes(value) ||
      item.roomType.toLowerCase().includes(value)
    );
  });

  return (
    <div className="page-card">
      <h2>Sub Projects</h2>

      <div style={{ display: "grid", gap: "10px", maxWidth: "400px", marginBottom: "20px" }}>
        <select
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.name}>
              {project.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Sub Project Name"
          value={subProjectName}
          onChange={(e) => setSubProjectName(e.target.value)}
        />

        <input
          type="text"
          placeholder="Room Type"
          value={roomType}
          onChange={(e) => setRoomType(e.target.value)}
        />

        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={handleAddOrUpdateSubProject}>
            {editId ? "Update Sub Project" : "Add Sub Project"}
          </button>

          {editId && (
            <button onClick={resetForm}>
              Cancel Edit
            </button>
          )}
        </div>
      </div>

      <div style={{ maxWidth: "400px", marginBottom: "20px" }}>
        <input
          type="text"
          placeholder="Search by project, sub project, or room type"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
        />
      </div>

      <table border="1" cellPadding="10" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th>ID</th>
            <th>Project Name</th>
            <th>Sub Project</th>
            <th>Room Type</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
  {filteredSubProjects.length > 0 ? (
    filteredSubProjects.map((item) => (
      <tr key={item.id}>
        <td>{item.id}</td>
        <td>{item.project}</td>
        <td>{item.subProject}</td>
        <td>{item.roomType}</td>
        <td style={{ display: "flex", gap: "8px" }}>
          <button onClick={() => handleEditSubProject(item)}>Edit</button>
          <button onClick={() => handleDeleteSubProject(item.id)}>Delete</button>
        </td>
      </tr>
    ))
  ) : (
    <tr>
      <td colSpan="5">No sub projects found.</td>
    </tr>
  )}
</tbody>
      </table>
    </div>
  );
}

export default SubProjects;