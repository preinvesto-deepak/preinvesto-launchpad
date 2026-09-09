import { useEffect, useMemo, useState } from "react";
import { mmToFeet, roundTo2 } from "../utils/unitConversions";
import { useAppData } from "../context/AppDataContext";

function FieldRow({ label, children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "220px 1fr",
        gap: "12px",
        alignItems: "start",
        marginBottom: "10px",
      }}
    >
      <div style={{ paddingTop: "8px" }}>{label}</div>
      {children}
    </div>
  );
}

function InfoHint({ text }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ display: "inline-block", position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="More information"
        title="More information"
        style={{
          width: "22px",
          height: "22px",
          minWidth: "22px",
          minHeight: "22px",
          borderRadius: "50%",
          border: "none",
          background: "#2563eb",
          color: "#ffffff",
          fontSize: "12px",
          fontWeight: "700",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }}
      >
        i
      </button>

      {open && (
        <div
          style={{
            marginTop: "8px",
            padding: "10px",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            background: "#f9fafb",
            color: "#374151",
            fontSize: "13px",
            lineHeight: "1.4",
            maxWidth: "280px",
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid #d1d5db",
        borderRadius: "12px",
        padding: "16px",
        background: "#ffffff",
        marginBottom: "20px",
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: "14px" }}>{title}</h3>
      {children}
    </div>
  );
}

function ValidationItem({ ok, text }) {
  return (
    <div
      style={{
        color: ok ? "#166534" : "#b91c1c",
        marginBottom: "6px",
        fontWeight: 500,
      }}
    >
      {ok ? "✓" : "✗"} {text}
    </div>
  );
}

function WardrobeConfigurator() {
  const {
    projects,
    subProjects,
    prices,
    templates,
    selectedTemplateId,
    setGeneratedParts,
    configuredWardrobe,
    setConfiguredWardrobe,
    wardrobeRecords,
    setWardrobeRecords,
    editingWardrobeRecordId,
    setEditingWardrobeRecordId,
  } = useAppData();

  const STANDARD_SHEET_LENGTH = 2400;
  const STANDARD_SHEET_WIDTH = 1200;

  const CARCASS_THICKNESS_MM = 19;
  const FRONT_FRAME_SECTION_MM = 75;
  const SWING_MAX_DOOR_WIDTH_MM = 450;

  const selectedTemplate = useMemo(() => {
    return templates.find((item) => String(item.id) === String(selectedTemplateId)) || templates[0] || null;
  }, [selectedTemplateId, templates]);

  const hasDoors = selectedTemplate?.hasDoors !== false;

  const createHardwareRow = (rowId) => ({
    rowId,
    itemName: "",
    qty: 1,
    rate: 0,
  });

  const createLaminateRow = (rowId) => ({
    rowId,
    itemName: "",
    qty: 1,
    rate: 0,
  });

  const createEdgeBandRow = (rowId) => ({
    rowId,
    itemName: "",
    qty: 1,
    rate: 0,
  });

  const getRecommendedBackParts = (widthMm) => {
    const width = Number(widthMm || 0);

    if (width < 1200) return 1;
    if (width >= 1200 && width < 2400) return 2;
    if (width >= 2400 && width <= 3600) return 3;

    return Math.max(Math.ceil(width / 1200), 1);
  };

  const getRecommendedDoorsH = (widthMm, doorType) => {
    const width = Number(widthMm || 0);

    if (doorType === "sliding") {
      return getRecommendedBackParts(width);
    }

    return Math.max(Math.ceil(width / SWING_MAX_DOOR_WIDTH_MM), 1);
  };

  const getRecommendedDoorsV = (heightMm) => {
    const height = Number(heightMm || 0);
    if (height <= 2400) return 1;
    return 2;
  };

  const getHingesPerLeaf = (doorLeafHeightMm) => {
    const height = Number(doorLeafHeightMm || 0);

    if (height <= 1200) return 2;
    if (height <= 2100) return 3;
    return 4;
  };

  const getHardwareTemplateRows = (
    doorType,
    doorsH,
    doorsV,
    doorLeafHeightMm
  ) => {
    const totalDoorLeaves = Math.max(
      Number(doorsH || 0) * Number(doorsV || 0),
      1
    );

    if (doorType === "sliding") {
      return [
        { rowId: 1, itemName: "Sliding Track Set", qty: 1, rate: 0 },
        {
          rowId: 2,
          itemName: "Sliding Profile / Handle",
          qty: totalDoorLeaves,
          rate: 0,
        },
        { rowId: 3, itemName: "Soft Close Set", qty: 1, rate: 0 },
        { rowId: 4, itemName: "Door Stopper", qty: 2, rate: 0 },
      ];
    }

    const hingesPerLeaf = getHingesPerLeaf(doorLeafHeightMm);

    return [
      {
        rowId: 1,
        itemName: "Hinges",
        qty: totalDoorLeaves * hingesPerLeaf,
        rate: 0,
      },
      { rowId: 2, itemName: "Handles", qty: totalDoorLeaves, rate: 0 },
      {
        rowId: 3,
        itemName: "Magnet / Catcher",
        qty: totalDoorLeaves,
        rate: 0,
      },
      {
        rowId: 4,
        itemName: "Tower Bolt / Lock",
        qty: Math.max(Number(doorsH || 0), 1),
        rate: 0,
      },
    ];
  };

  const [formData, setFormData] = useState({
    projectName: projects[0]?.name || "",
    subProjectName: "",
    itemName: "Wardrobe",
    specification: "",
    remarks: "",
    doorType: "swing",
    widthMm: 0,
    heightMm: 0,
    depthMm: 0,
    doorsH: 0,
    doorsV: 0,
    backParts: 1,
    partitions: 0,
    shelves: 0,
    frontFrame: 0,
    glueAmount: 0,
    drawerAmount: 0,
    frontFrameAmount: 0,
    laborAmount: 0,
    transportAmount: 0,
  });

  const [hardwareItems, setHardwareItems] = useState([createHardwareRow(1)]);
  const [laminateItems, setLaminateItems] = useState([createLaminateRow(1)]);
  const [edgeBandItems, setEdgeBandItems] = useState([createEdgeBandRow(1)]);

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

    if (name === "doorType") {
      setFormData({
        ...formData,
        doorType: value,
      });
      return;
    }

    if (
      name === "widthMm" ||
      name === "heightMm" ||
      name === "depthMm" ||
      name === "doorsH" ||
      name === "doorsV" ||
      name === "backParts" ||
      name === "partitions" ||
      name === "shelves" ||
      name === "frontFrame" ||
      name === "glueAmount" ||
      name === "drawerAmount" ||
      name === "frontFrameAmount" ||
      name === "laborAmount" ||
      name === "transportAmount"
    ) {
      setFormData({
        ...formData,
        [name]: Number(value),
      });
      return;
    }

    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleHardwareChange = (rowId, field, value) => {
    setHardwareItems((prev) =>
      prev.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              [field]:
                field === "qty" || field === "rate" ? Number(value) : value,
            }
          : item
      )
    );
  };

  const addHardwareRow = () => {
    setHardwareItems((prev) => {
      const nextId =
        prev.length > 0 ? Math.max(...prev.map((item) => item.rowId)) + 1 : 1;
      return [...prev, createHardwareRow(nextId)];
    });
  };

  const removeHardwareRow = (rowId) => {
    setHardwareItems((prev) => {
      if (prev.length === 1) return [createHardwareRow(1)];
      return prev.filter((item) => item.rowId !== rowId);
    });
  };

  const handleLaminateChange = (rowId, field, value) => {
    setLaminateItems((prev) =>
      prev.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              [field]:
                field === "qty" || field === "rate" ? Number(value) : value,
            }
          : item
      )
    );
  };

  const addLaminateRow = () => {
    setLaminateItems((prev) => {
      const nextId =
        prev.length > 0 ? Math.max(...prev.map((item) => item.rowId)) + 1 : 1;
      return [...prev, createLaminateRow(nextId)];
    });
  };

  const removeLaminateRow = (rowId) => {
    setLaminateItems((prev) => {
      if (prev.length === 1) return [createLaminateRow(1)];
      return prev.filter((item) => item.rowId !== rowId);
    });
  };

  const applyLaminateTemplate = () => {
    setLaminateItems([
      { rowId: 1, itemName: "Outer Laminate", qty: 1, rate: 0 },
      { rowId: 2, itemName: "Inner Laminate", qty: 1, rate: 0 },
      { rowId: 3, itemName: "Loft / Top Laminate", qty: 1, rate: 0 },
    ]);
  };

  const handleEdgeBandChange = (rowId, field, value) => {
    setEdgeBandItems((prev) =>
      prev.map((item) =>
        item.rowId === rowId
          ? {
              ...item,
              [field]:
                field === "qty" || field === "rate" ? Number(value) : value,
            }
          : item
      )
    );
  };

  const addEdgeBandRow = () => {
    setEdgeBandItems((prev) => {
      const nextId =
        prev.length > 0 ? Math.max(...prev.map((item) => item.rowId)) + 1 : 1;
      return [...prev, createEdgeBandRow(nextId)];
    });
  };

  const removeEdgeBandRow = (rowId) => {
    setEdgeBandItems((prev) => {
      if (prev.length === 1) return [createEdgeBandRow(1)];
      return prev.filter((item) => item.rowId !== rowId);
    });
  };

  const applyEdgeBandTemplate = () => {
    setEdgeBandItems([
      { rowId: 1, itemName: "Front Edge Band", qty: 1, rate: 0 },
      { rowId: 2, itemName: "Shelf Edge Band", qty: 1, rate: 0 },
      { rowId: 3, itemName: "Shutter Edge Band", qty: 1, rate: 0 },
    ]);
  };

  const normalizedLaminateItems = laminateItems
    .map((item) => ({
      ...item,
      amount: Number(item.qty || 0) * Number(item.rate || 0),
    }))
    .filter(
      (item) =>
        String(item.itemName || "").trim() !== "" ||
        Number(item.qty || 0) > 0 ||
        Number(item.rate || 0) > 0
    );

  const laminateAmount = normalizedLaminateItems.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const normalizedEdgeBandItems = edgeBandItems
    .map((item) => ({
      ...item,
      amount: Number(item.qty || 0) * Number(item.rate || 0),
    }))
    .filter(
      (item) =>
        String(item.itemName || "").trim() !== "" ||
        Number(item.qty || 0) > 0 ||
        Number(item.rate || 0) > 0
    );

  const edgeBandAmount = normalizedEdgeBandItems.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const normalizedHardwareItems = hardwareItems
    .map((item) => ({
      ...item,
      amount: Number(item.qty || 0) * Number(item.rate || 0),
    }))
    .filter(
      (item) =>
        String(item.itemName || "").trim() !== "" ||
        Number(item.qty || 0) > 0 ||
        Number(item.rate || 0) > 0
    );

  const hardwareAmount = normalizedHardwareItems.reduce(
    (sum, item) => sum + item.amount,
    0
  );

  const recommendedBackParts = getRecommendedBackParts(formData.widthMm);
  const recommendedDoorsH = getRecommendedDoorsH(
    formData.widthMm,
    formData.doorType
  );
  const recommendedDoorsV = getRecommendedDoorsV(formData.heightMm);

  const applyBackPartsFormula = () => {
    setFormData({
      ...formData,
      backParts: recommendedBackParts,
    });
  };

  const applyDoorsHFormula = () => {
    setFormData({
      ...formData,
      doorsH: recommendedDoorsH,
    });
  };

  const applyDoorsVFormula = () => {
    setFormData({
      ...formData,
      doorsV: recommendedDoorsV,
    });
  };

  const applyFrontFrameFormula = () => {
    setFormData({
      ...formData,
      frontFrame: formData.frontFrame > 0 ? 0 : 1,
    });
  };

  const innerCarcassWidthMm = Math.max(
    Number(formData.widthMm) - 2 * CARCASS_THICKNESS_MM,
    0
  );

  const innerCarcassHeightMm = Math.max(
    Number(formData.heightMm) - 2 * CARCASS_THICKNESS_MM,
    0
  );

  const openingCount = Math.max(Number(formData.partitions) + 1, 1);

  const shelfEachWidthMm = Math.max(
    Math.ceil(
      (innerCarcassWidthMm -
        Number(formData.partitions) * CARCASS_THICKNESS_MM) / openingCount
    ),
    0
  );

  const partitionHeightMm = innerCarcassHeightMm;

  const backPanelEachWidthMm =
    Number(formData.backParts) > 0
      ? Math.ceil(Number(formData.widthMm) / Number(formData.backParts))
      : Number(formData.widthMm);

  const doorLeafWidthMm =
    Number(formData.doorsH) > 0
      ? Math.ceil(Number(formData.widthMm) / Number(formData.doorsH))
      : Number(formData.widthMm);

  const doorLeafHeightMm =
    Number(formData.doorsV) > 0
      ? Math.ceil(Number(formData.heightMm) / Number(formData.doorsV))
      : Number(formData.heightMm);

  const doorLeafQty = Math.max(
    Number(formData.doorsH) * Number(formData.doorsV),
    0
  );

  const frontFrameVerticalQty = Number(formData.frontFrame) > 0 ? 2 : 0;
  const frontFrameHorizontalQty = Number(formData.frontFrame) > 0 ? 2 : 0;

  const frontFrameHorizontalWidthMm = Math.max(
    Number(formData.widthMm) - 2 * FRONT_FRAME_SECTION_MM,
    0
  );

  const applyHardwareTemplate = () => {
    setHardwareItems(
      getHardwareTemplateRows(
        formData.doorType,
        formData.doorsH,
        formData.doorsV,
        doorLeafHeightMm
      )
    );
  };

  const applyDrawerHardwareTemplate = () => {
    const drawerQty = Math.max(Number(formData.drawerAmount || 0), 1);

    const drawerRows = [
      { rowId: 1, itemName: "Drawer Channel Pair", qty: drawerQty, rate: 0 },
      { rowId: 2, itemName: "Drawer Handle", qty: drawerQty, rate: 0 },
      {
        rowId: 3,
        itemName: "Drawer Screws / Accessories",
        qty: drawerQty,
        rate: 0,
      },
    ];

    setHardwareItems((prev) => {
      const activeRows = prev.filter(
        (item) =>
          String(item.itemName || "").trim() !== "" ||
          Number(item.qty || 0) > 0 ||
          Number(item.rate || 0) > 0
      );

      const nextId =
        activeRows.length > 0
          ? Math.max(...activeRows.map((item) => item.rowId)) + 1
          : 1;

      const appendedRows = drawerRows.map((row, index) => ({
        ...row,
        rowId: nextId + index,
      }));

      return [...activeRows, ...appendedRows];
    });
  };

  const rawParts = [
    {
      id: 1,
      partName: "LHS",
      lengthMm: formData.heightMm,
      widthMm: formData.depthMm,
      qty: 1,
      material: "Plywood 19mm",
    },
    {
      id: 2,
      partName: "RHS",
      lengthMm: formData.heightMm,
      widthMm: formData.depthMm,
      qty: 1,
      material: "Plywood 19mm",
    },
    {
      id: 3,
      partName: "Top",
      lengthMm: innerCarcassWidthMm,
      widthMm: formData.depthMm,
      qty: 1,
      material: "Plywood 19mm",
    },
    {
      id: 4,
      partName: "Bottom",
      lengthMm: innerCarcassWidthMm,
      widthMm: formData.depthMm,
      qty: 1,
      material: "Plywood 19mm",
    },
    {
      id: 5,
      partName: "Shelf",
      lengthMm: shelfEachWidthMm,
      widthMm: formData.depthMm,
      qty: Number(formData.shelves) * openingCount,
      material: "Plywood 19mm",
    },
    {
      id: 6,
      partName: "Vertical Partition",
      lengthMm: partitionHeightMm,
      widthMm: formData.depthMm,
      qty: formData.partitions,
      material: "Plywood 19mm",
    },
    {
      id: 7,
      partName: "Back Panel",
      lengthMm: formData.heightMm,
      widthMm: backPanelEachWidthMm,
      qty: formData.backParts,
      material: "Plywood 6mm",
    },
    {
      id: 8,
      partName:
        formData.doorType === "sliding"
          ? "Sliding Door Leaf"
          : "Swing Door Leaf",
      lengthMm: doorLeafHeightMm,
      widthMm: doorLeafWidthMm,
      qty: doorLeafQty,
      material: "Plywood 19mm",
    },
    {
      id: 9,
      partName: "Front Frame Vertical",
      lengthMm: formData.heightMm,
      widthMm: FRONT_FRAME_SECTION_MM,
      qty: frontFrameVerticalQty,
      material: "Plywood 19mm",
    },
    {
      id: 10,
      partName: "Front Frame Horizontal",
      lengthMm: FRONT_FRAME_SECTION_MM,
      widthMm: frontFrameHorizontalWidthMm,
      qty: frontFrameHorizontalQty,
      material: "Plywood 19mm",
    },
  ];

  const canFitInSheet = (lengthMm, widthMm) => {
    return (
      (lengthMm <= STANDARD_SHEET_LENGTH &&
        widthMm <= STANDARD_SHEET_WIDTH) ||
      (lengthMm <= STANDARD_SHEET_WIDTH &&
        widthMm <= STANDARD_SHEET_LENGTH)
    );
  };

  const parts = rawParts
    .filter((part) => Number(part.qty) > 0)
    .map((part) => ({
      ...part,
      totalAreaSqMm:
        Number(part.lengthMm) * Number(part.widthMm) * Number(part.qty),
      fitsInSheet: canFitInSheet(
        Number(part.lengthMm),
        Number(part.widthMm)
      ),
    }));

  const invalidParts = parts.filter((part) => !part.fitsInSheet);

  const sheetArea = 2440 * 1220;

  const materialGroups = parts.reduce((acc, part) => {
    const key = part.material || "Unknown";
    const partArea =
      Number(part.lengthMm) * Number(part.widthMm) * Number(part.qty);

    if (!acc[key]) {
      acc[key] = {
        material: key,
        totalAreaSqMm: 0,
      };
    }

    acc[key].totalAreaSqMm += partArea;
    return acc;
  }, {});

  const woodEstimate = Object.values(materialGroups).reduce((total, group) => {
    const materialRateData = prices.find(
      (item) => item.materialName === group.material
    );
    const requiredSheets =
      sheetArea > 0 ? Math.ceil(group.totalAreaSqMm / sheetArea) : 0;
    const sheetRate = materialRateData ? Number(materialRateData.rate) : 0;
    return total + requiredSheets * sheetRate;
  }, 0);

  const extraHeadsTotal =
    laminateAmount +
    edgeBandAmount +
    Number(formData.glueAmount || 0) +
    Number(formData.drawerAmount || 0) +
    Number(formData.frontFrameAmount || 0) +
    Number(formData.laborAmount || 0) +
    Number(formData.transportAmount || 0);

  const estimatedSubTotal = woodEstimate + hardwareAmount + extraHeadsTotal;

  const swingDoorWidthExceeded =
    hasDoors &&
    formData.doorType === "swing" &&
    Number(formData.doorsH) > 0 &&
    doorLeafWidthMm > SWING_MAX_DOOR_WIDTH_MM;

  const hasProject = Boolean(formData.projectName);
  const hasSubProject = Boolean(formData.subProjectName);
  const hasItemName = Boolean(String(formData.itemName || "").trim());
  const hasValidParts =
    invalidParts.length === 0 && !swingDoorWidthExceeded;

  const canSave =
    hasProject && hasSubProject && hasItemName && hasValidParts;

  useEffect(() => {
    const shouldLoadSavedRecord = Boolean(
      configuredWardrobe && (editingWardrobeRecordId || configuredWardrobe.id)
    );

    if (shouldLoadSavedRecord) {
      setFormData({
        projectName: configuredWardrobe.projectName || projects[0]?.name || "",
        subProjectName: configuredWardrobe.subProjectName || "",
        itemName: configuredWardrobe.itemName || "Wardrobe",
        specification: configuredWardrobe.specification || "",
        remarks: configuredWardrobe.remarks || "",
        doorType: configuredWardrobe.doorType || "swing",
        widthMm: Number(configuredWardrobe.widthMm || 0),
        heightMm: Number(configuredWardrobe.heightMm || 0),
        depthMm: Number(configuredWardrobe.depthMm || 0),
        doorsH: Number(configuredWardrobe.doorsH || 0),
        doorsV: Number(configuredWardrobe.doorsV || 0),
        backParts: Number(configuredWardrobe.backParts || 1),
        partitions: Number(configuredWardrobe.partitions || 0),
        shelves: Number(configuredWardrobe.shelves || 0),
        frontFrame: Number(configuredWardrobe.frontFrame || 0),
        glueAmount: Number(configuredWardrobe.glueAmount || 0),
        drawerAmount: Number(configuredWardrobe.drawerAmount || 0),
        frontFrameAmount: Number(configuredWardrobe.frontFrameAmount || 0),
        laborAmount: Number(configuredWardrobe.laborAmount || 0),
        transportAmount: Number(configuredWardrobe.transportAmount || 0),
      });

      if (
        Array.isArray(configuredWardrobe.hardwareItems) &&
        configuredWardrobe.hardwareItems.length > 0
      ) {
        setHardwareItems(
          configuredWardrobe.hardwareItems.map((item, index) => ({
            rowId: index + 1,
            itemName: item.itemName || "",
            qty: Number(item.qty || 1),
            rate: Number(item.rate || 0),
          }))
        );
      } else if (Number(configuredWardrobe.hardwareAmount || 0) > 0) {
        setHardwareItems([
          {
            rowId: 1,
            itemName: "Hardware",
            qty: 1,
            rate: Number(configuredWardrobe.hardwareAmount || 0),
          },
        ]);
      } else {
        setHardwareItems([createHardwareRow(1)]);
      }

      if (
        Array.isArray(configuredWardrobe.laminateItems) &&
        configuredWardrobe.laminateItems.length > 0
      ) {
        setLaminateItems(
          configuredWardrobe.laminateItems.map((item, index) => ({
            rowId: index + 1,
            itemName: item.itemName || "",
            qty: Number(item.qty || 1),
            rate: Number(item.rate || 0),
          }))
        );
      } else if (Number(configuredWardrobe.laminateAmount || 0) > 0) {
        setLaminateItems([
          {
            rowId: 1,
            itemName: "Laminate",
            qty: 1,
            rate: Number(configuredWardrobe.laminateAmount || 0),
          },
        ]);
      } else {
        setLaminateItems([createLaminateRow(1)]);
      }

      if (
        Array.isArray(configuredWardrobe.edgeBandItems) &&
        configuredWardrobe.edgeBandItems.length > 0
      ) {
        setEdgeBandItems(
          configuredWardrobe.edgeBandItems.map((item, index) => ({
            rowId: index + 1,
            itemName: item.itemName || "",
            qty: Number(item.qty || 1),
            rate: Number(item.rate || 0),
          }))
        );
      } else if (Number(configuredWardrobe.edgeBandAmount || 0) > 0) {
        setEdgeBandItems([
          {
            rowId: 1,
            itemName: "Edge Band",
            qty: 1,
            rate: Number(configuredWardrobe.edgeBandAmount || 0),
          },
        ]);
      } else {
        setEdgeBandItems([createEdgeBandRow(1)]);
      }

      return;
    }

    if (!selectedTemplate) return;

    const defaultWidthMm = selectedTemplate.defaultValues.widthMm;
    const defaultHeightMm = selectedTemplate.defaultValues.heightMm;
    const defaultDoorType = "swing";

    setFormData((prev) => ({
      ...prev,
      widthMm: defaultWidthMm,
      heightMm: defaultHeightMm,
      depthMm: selectedTemplate.defaultValues.depthMm,
      doorType: defaultDoorType,
      doorsH: hasDoors ? getRecommendedDoorsH(defaultWidthMm, defaultDoorType) : 0,
      doorsV: hasDoors ? getRecommendedDoorsV(defaultHeightMm) : 0,
      backParts: getRecommendedBackParts(defaultWidthMm),
      partitions: selectedTemplate.defaultValues.partitions,
      shelves: selectedTemplate.defaultValues.shelves,
      frontFrame: hasDoors ? selectedTemplate.defaultValues.frontFrame : 0,
      specification: "",
      remarks: "",
      glueAmount: 0,
      drawerAmount: 0,
      frontFrameAmount: 0,
      laborAmount: 0,
      transportAmount: 0,
    }));

    setHardwareItems([createHardwareRow(1)]);
    setLaminateItems([createLaminateRow(1)]);
    setEdgeBandItems([createEdgeBandRow(1)]);
  }, [selectedTemplate, editingWardrobeRecordId, configuredWardrobe, projects]);

  const handleSaveGeneratedParts = () => {
    if (
      !formData.projectName ||
      !formData.subProjectName ||
      !formData.itemName
    ) {
      alert("Please select project, sub project, and item name");
      return;
    }

    if (swingDoorWidthExceeded) {
      alert(
        `Swing door leaf width exceeds ${SWING_MAX_DOOR_WIDTH_MM} mm. Increase Doors H or reduce width before saving.`
      );
      return;
    }

    if (invalidParts.length > 0) {
      alert(
        "Some generated parts exceed standard sheet size 2400 x 1200 mm. Please correct dimensions before saving."
      );
      return;
    }

    const recordId =
      editingWardrobeRecordId ||
      (wardrobeRecords.length > 0
        ? Math.max(...wardrobeRecords.map((item) => item.id)) + 1
        : 1);

    const savedRecord = {
      id: recordId,
      templateId: String(selectedTemplate.id),
      templateName: selectedTemplate.templateName,
      templateType: selectedTemplate.templateType,
      ...formData,
      laminateItems: normalizedLaminateItems,
      laminateAmount,
      edgeBandItems: normalizedEdgeBandItems,
      edgeBandAmount,
      hardwareItems: normalizedHardwareItems,
      hardwareAmount,
      parts,
    };

    const updatedRecords = editingWardrobeRecordId
      ? wardrobeRecords.map((record) =>
          record.id === editingWardrobeRecordId ? savedRecord : record
        )
      : [...wardrobeRecords, savedRecord];

    setGeneratedParts(parts);
    setConfiguredWardrobe(savedRecord);
    setWardrobeRecords(updatedRecords);
    setEditingWardrobeRecordId(null);

    alert(
      editingWardrobeRecordId
        ? "Wardrobe record updated successfully"
        : "Generated parts saved successfully"
    );
  };

  return (
    <div className="page-card">
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 30,
          background: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: "12px",
          padding: "12px 16px",
          marginBottom: "20px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "10px",
          }}
        >
          <div>
            <strong>Width:</strong> {formData.widthMm} mm
          </div>
          <div>
            <strong>Height:</strong> {formData.heightMm} mm
          </div>
          {hasDoors && (
            <div>
              <strong>Door Type:</strong> {formData.doorType}
            </div>
          )}
          <div>
            <strong>Back Parts:</strong> {formData.backParts}
          </div>
          {hasDoors && (
            <div>
              <strong>Doors:</strong> {formData.doorsH} x {formData.doorsV}
            </div>
          )}
          <div>
            <strong>Laminate:</strong> {laminateAmount}
          </div>
          <div>
            <strong>Edge Band:</strong> {edgeBandAmount}
          </div>
          <div>
            <strong>Hardware:</strong> {hardwareAmount}
          </div>
          <div>
            <strong>Est. Sub Total:</strong> {estimatedSubTotal}
          </div>
        </div>
      </div>

      <h2>{selectedTemplate.templateName} Configurator</h2>

      <SectionCard title="Validation Summary">
        <ValidationItem ok={hasProject} text="Project selected" />
        <ValidationItem ok={hasSubProject} text="Sub Project selected" />
        <ValidationItem ok={hasItemName} text="Item Name entered" />
        <ValidationItem
          ok={hasValidParts}
          text="All generated parts fit within standard sheet size"
        />
        {hasDoors && (
          <ValidationItem
            ok={!swingDoorWidthExceeded}
            text={`Swing door leaf width must be ${SWING_MAX_DOOR_WIDTH_MM} mm or less`}
          />
        )}
        <div
          style={{
            marginTop: "12px",
            padding: "10px",
            borderRadius: "8px",
            background: canSave ? "#ecfdf5" : "#fef2f2",
            color: canSave ? "#166534" : "#b91c1c",
            fontWeight: "600",
          }}
        >
          {canSave
            ? "Ready to Save"
            : "Please correct the above issues before saving"}
        </div>
      </SectionCard>

      <SectionCard title="Template Details">
        <p>
          <strong>Selected Template:</strong> {selectedTemplate.templateName}
        </p>
        <p>
          <strong>Type:</strong> {selectedTemplate.templateType}
        </p>
        <p>
          <strong>Standard Full Sheet:</strong> {STANDARD_SHEET_LENGTH} x{" "}
          {STANDARD_SHEET_WIDTH} mm
        </p>
      </SectionCard>

      {invalidParts.length > 0 && (
        <div
          style={{
            marginBottom: "20px",
            padding: "14px",
            border: "1px solid #dc2626",
            background: "#fef2f2",
            borderRadius: "10px",
          }}
        >
          <p>
            <strong>Sheet Size Warning:</strong> Some parts do not fit within
            2400 x 1200 mm.
          </p>
          {invalidParts.map((part) => (
            <p key={part.id}>
              {part.partName}: {part.lengthMm} x {part.widthMm} mm
            </p>
          ))}
        </div>
      )}

      <SectionCard title="Project Details">
        <FieldRow label={<span style={{ fontWeight: "600" }}>Project</span>}>
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
        </FieldRow>

        <FieldRow
          label={<span style={{ fontWeight: "600" }}>Sub Project</span>}
        >
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
        </FieldRow>

        <FieldRow label={<span style={{ fontWeight: "600" }}>Item Name</span>}>
          <input
            type="text"
            name="itemName"
            placeholder="Item Name"
            value={formData.itemName}
            onChange={handleChange}
          />
        </FieldRow>

        <FieldRow
          label={<span style={{ fontWeight: "600" }}>Specification</span>}
        >
          <textarea
            name="specification"
            placeholder="Enter specification"
            value={formData.specification}
            onChange={handleChange}
            rows="3"
            style={{ width: "100%" }}
          />
        </FieldRow>

        <FieldRow label={<span style={{ fontWeight: "600" }}>Remarks</span>}>
          <textarea
            name="remarks"
            placeholder="Enter remarks"
            value={formData.remarks}
            onChange={handleChange}
            rows="3"
            style={{ width: "100%" }}
          />
        </FieldRow>
      </SectionCard>

      <SectionCard title="Dimensions">
        <FieldRow label={<span style={{ fontWeight: "600" }}>Width (mm)</span>}>
          <input
            type="number"
            name="widthMm"
            value={formData.widthMm}
            onChange={handleChange}
          />
        </FieldRow>

        <FieldRow
          label={<span style={{ fontWeight: "600" }}>Height (mm)</span>}
        >
          <input
            type="number"
            name="heightMm"
            value={formData.heightMm}
            onChange={handleChange}
          />
        </FieldRow>

        <FieldRow label={<span style={{ fontWeight: "600" }}>Depth (mm)</span>}>
          <input
            type="number"
            name="depthMm"
            value={formData.depthMm}
            onChange={handleChange}
          />
        </FieldRow>
      </SectionCard>

      <SectionCard title="Configuration">
        {hasDoors && (
          <>
            <FieldRow
              label={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: "600",
                  }}
                >
                  <span>Door Type</span>
                  <InfoHint text="Select Sliding Door or Swing Door. Sliding door width follows back part type breakup. Swing door width is limited to max 450 mm per leaf." />
                </div>
              }
            >
              <select
                name="doorType"
                value={formData.doorType}
                onChange={handleChange}
              >
                <option value="swing">Swing Door</option>
                <option value="sliding">Sliding Door</option>
              </select>
            </FieldRow>

            <FieldRow
              label={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: "600",
                  }}
                >
                  <span>Doors H</span>
                  <InfoHint text="Number of door pieces across width. Sliding: same formula as back parts. Swing: maximum leaf width 450 mm." />
                </div>
              }
            >
              <div>
                <div
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <input
                    type="number"
                    name="doorsH"
                    value={formData.doorsH}
                    onChange={handleChange}
                    style={{ flex: 1 }}
                  />
                  <button type="button" onClick={applyDoorsHFormula}>
                    Use Door Formula
                  </button>
                </div>
                <div
                  style={{ marginTop: "8px", fontSize: "13px", color: "#374151" }}
                >
                  {formData.doorType === "sliding" ? (
                    <>
                      Sliding door rule:
                      <br />
                      Width &lt; 1200 → 1
                      <br />
                      Width 1200 to &lt; 2400 → 2
                      <br />
                      Width 2400 to 3600 → 3
                    </>
                  ) : (
                    <>
                      Swing door rule:
                      <br />
                      Max single door width = 450 mm
                      <br />
                      Recommended Doors H = ceil(width / 450)
                    </>
                  )}
                  <br />
                  Current Recommended Doors H: <strong>{recommendedDoorsH}</strong>
                </div>
              </div>
            </FieldRow>

            <FieldRow
              label={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontWeight: "600",
                  }}
                >
                  <span>Doors V</span>
                  <InfoHint text="Number of door pieces across height." />
                </div>
              }
            >
              <div>
                <div
                  style={{ display: "flex", gap: "10px", alignItems: "center" }}
                >
                  <input
                    type="number"
                    name="doorsV"
                    value={formData.doorsV}
                    onChange={handleChange}
                    style={{ flex: 1 }}
                  />
                  <button type="button" onClick={applyDoorsVFormula}>
                    Use Height Formula
                  </button>
                </div>
                <div
                  style={{ marginTop: "8px", fontSize: "13px", color: "#374151" }}
                >
                  Recommended rule:
                  <br />
                  Height up to 2400 → 1
                  <br />
                  Height above 2400 → 2
                  <br />
                  Current Recommended Doors V: <strong>{recommendedDoorsV}</strong>
                </div>
              </div>
            </FieldRow>
          </>
        )}

        <FieldRow
          label={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: "600",
              }}
            >
              <span>Back Parts</span>
              <InfoHint text="No of pieces should the back side ply to be cut in width" />
            </div>
          }
        >
          <div>
            <div
              style={{ display: "flex", gap: "10px", alignItems: "center" }}
            >
              <input
                type="number"
                name="backParts"
                value={formData.backParts}
                onChange={handleChange}
                style={{ flex: 1 }}
              />
              <button type="button" onClick={applyBackPartsFormula}>
                Use Width Formula
              </button>
            </div>
            <div
              style={{ marginTop: "8px", fontSize: "13px", color: "#374151" }}
            >
              Recommended rule:
              <br />
              Width &lt; 1200 → 1
              <br />
              Width 1200 to &lt; 2400 → 2
              <br />
              Width 2400 to 3600 → 3
              <br />
              Current Recommended Back Parts:{" "}
              <strong>{recommendedBackParts}</strong>
            </div>
          </div>
        </FieldRow>

        <FieldRow
          label={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: "600",
              }}
            >
              <span>Partitions</span>
              <InfoHint text="Number of vertical divider panels inside the wardrobe." />
            </div>
          }
        >
          <input
            type="number"
            name="partitions"
            value={formData.partitions}
            onChange={handleChange}
          />
        </FieldRow>

        <FieldRow
          label={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontWeight: "600",
              }}
            >
              <span>Shelves</span>
              <InfoHint text="Number of shelf levels to be provided in each opening." />
            </div>
          }
        >
          <input
            type="number"
            name="shelves"
            value={formData.shelves}
            onChange={handleChange}
          />
        </FieldRow>

        {hasDoors && (
          <FieldRow
            label={
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontWeight: "600",
                }}
              >
                <span>Front Frame</span>
                <InfoHint text="Enable or disable front frame breakup pieces on the front side of the unit." />
              </div>
            }
          >
            <div>
              <div
                style={{ display: "flex", gap: "10px", alignItems: "center" }}
              >
                <input
                  type="number"
                  name="frontFrame"
                  value={formData.frontFrame}
                  onChange={handleChange}
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={applyFrontFrameFormula}>
                  Use Formula
                </button>
              </div>
              <div
                style={{ marginTop: "8px", fontSize: "13px", color: "#374151" }}
              >
                Rule:
                <br />
                0 = No Front Frame
                <br />
                1 = Add Front Frame
              </div>
            </div>
          </FieldRow>
        )}
      </SectionCard>

      <SectionCard title="Hardware Breakdown">
        <table border="1" cellPadding="10" cellSpacing="0" width="100%">
          <thead>
            <tr>
              <th>#</th>
              <th>Hardware Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {hardwareItems.map((item, index) => {
              const amount = Number(item.qty || 0) * Number(item.rate || 0);

              return (
                <tr key={item.rowId}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      value={item.itemName}
                      onChange={(e) =>
                        handleHardwareChange(
                          item.rowId,
                          "itemName",
                          e.target.value
                        )
                      }
                      placeholder="e.g. Hinges / Handles / Channels"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) =>
                        handleHardwareChange(item.rowId, "qty", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) =>
                        handleHardwareChange(item.rowId, "rate", e.target.value)
                      }
                    />
                  </td>
                  <td>{amount}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeHardwareRow(item.rowId)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div
          style={{
            marginTop: "12px",
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button type="button" onClick={addHardwareRow}>
            Add Hardware Row
          </button>
          {hasDoors && (
            <button type="button" onClick={applyHardwareTemplate}>
              Apply {formData.doorType === "sliding" ? "Sliding" : "Swing"} Hardware Template
            </button>
          )}
          <button type="button" onClick={applyDrawerHardwareTemplate}>
            Apply Drawer Hardware Template
          </button>
        </div>

        <div
          style={{
            marginTop: "12px",
            padding: "10px",
            background: "#f9fafb",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            maxWidth: "320px",
          }}
        >
          <strong>Total Hardware Amount:</strong> {hardwareAmount}
        </div>
      </SectionCard>

      <SectionCard title="Laminate Breakdown">
        <table border="1" cellPadding="10" cellSpacing="0" width="100%">
          <thead>
            <tr>
              <th>#</th>
              <th>Laminate Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {laminateItems.map((item, index) => {
              const amount = Number(item.qty || 0) * Number(item.rate || 0);

              return (
                <tr key={item.rowId}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      value={item.itemName}
                      onChange={(e) =>
                        handleLaminateChange(
                          item.rowId,
                          "itemName",
                          e.target.value
                        )
                      }
                      placeholder="e.g. Outer Laminate"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) =>
                        handleLaminateChange(item.rowId, "qty", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) =>
                        handleLaminateChange(item.rowId, "rate", e.target.value)
                      }
                    />
                  </td>
                  <td>{amount}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeLaminateRow(item.rowId)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div
          style={{
            marginTop: "12px",
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button type="button" onClick={addLaminateRow}>
            Add Laminate Row
          </button>
          <button type="button" onClick={applyLaminateTemplate}>
            Apply Laminate Template
          </button>
        </div>

        <div
          style={{
            marginTop: "12px",
            padding: "10px",
            background: "#f9fafb",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            maxWidth: "320px",
          }}
        >
          <strong>Total Laminate Amount:</strong> {laminateAmount}
        </div>
      </SectionCard>

      <SectionCard title="Edge Band Breakdown">
        <table border="1" cellPadding="10" cellSpacing="0" width="100%">
          <thead>
            <tr>
              <th>#</th>
              <th>Edge Band Item</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {edgeBandItems.map((item, index) => {
              const amount = Number(item.qty || 0) * Number(item.rate || 0);

              return (
                <tr key={item.rowId}>
                  <td>{index + 1}</td>
                  <td>
                    <input
                      type="text"
                      value={item.itemName}
                      onChange={(e) =>
                        handleEdgeBandChange(
                          item.rowId,
                          "itemName",
                          e.target.value
                        )
                      }
                      placeholder="e.g. Front Edge Band"
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.qty}
                      onChange={(e) =>
                        handleEdgeBandChange(item.rowId, "qty", e.target.value)
                      }
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={item.rate}
                      onChange={(e) =>
                        handleEdgeBandChange(item.rowId, "rate", e.target.value)
                      }
                    />
                  </td>
                  <td>{amount}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeEdgeBandRow(item.rowId)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div
          style={{
            marginTop: "12px",
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button type="button" onClick={addEdgeBandRow}>
            Add Edge Band Row
          </button>
          <button type="button" onClick={applyEdgeBandTemplate}>
            Apply Edge Band Template
          </button>
        </div>

        <div
          style={{
            marginTop: "12px",
            padding: "10px",
            background: "#f9fafb",
            border: "1px solid #d1d5db",
            borderRadius: "8px",
            maxWidth: "320px",
          }}
        >
          <strong>Total Edge Band Amount:</strong> {edgeBandAmount}
        </div>
      </SectionCard>

      <SectionCard title="Cost Heads">
        <FieldRow label={<span style={{ fontWeight: "600" }}>Glue Amount</span>}>
          <input
            type="number"
            name="glueAmount"
            value={formData.glueAmount}
            onChange={handleChange}
          />
        </FieldRow>

        <FieldRow
          label={<span style={{ fontWeight: "600" }}>Drawer Amount</span>}
        >
          <input
            type="number"
            name="drawerAmount"
            value={formData.drawerAmount}
            onChange={handleChange}
          />
        </FieldRow>

        <FieldRow
          label={<span style={{ fontWeight: "600" }}>Front Frame Amount</span>}
        >
          <input
            type="number"
            name="frontFrameAmount"
            value={formData.frontFrameAmount}
            onChange={handleChange}
          />
        </FieldRow>

        <FieldRow
          label={<span style={{ fontWeight: "600" }}>Labor Amount</span>}
        >
          <input
            type="number"
            name="laborAmount"
            value={formData.laborAmount}
            onChange={handleChange}
          />
        </FieldRow>

        <FieldRow
          label={<span style={{ fontWeight: "600" }}>Transport Amount</span>}
        >
          <input
            type="number"
            name="transportAmount"
            value={formData.transportAmount}
            onChange={handleChange}
          />
        </FieldRow>

        <button onClick={handleSaveGeneratedParts}>
          {editingWardrobeRecordId
            ? "Update Wardrobe Record"
            : "Save Generated Parts"}
        </button>
      </SectionCard>

      <SectionCard title="Live Calculation Summary">
        <p>
          <strong>Project:</strong> {formData.projectName || "-"}
        </p>
        <p>
          <strong>Sub Project:</strong> {formData.subProjectName || "-"}
        </p>
        <p>
          <strong>Item Name:</strong> {formData.itemName}
        </p>
        <p>
          <strong>Door Type:</strong> {formData.doorType}
        </p>
        <p>
          <strong>Specification:</strong> {formData.specification || "-"}
        </p>
        <p>
          <strong>Remarks:</strong> {formData.remarks || "-"}
        </p>
        <p>
          <strong>Width:</strong> {formData.widthMm} mm (
          {roundTo2(mmToFeet(formData.widthMm))} ft)
        </p>
        <p>
          <strong>Height:</strong> {formData.heightMm} mm (
          {roundTo2(mmToFeet(formData.heightMm))} ft)
        </p>
        <p>
          <strong>Depth:</strong> {formData.depthMm} mm (
          {roundTo2(mmToFeet(formData.depthMm))} ft)
        </p>
        <p>
          <strong>Inner Carcass Width:</strong> {innerCarcassWidthMm} mm
        </p>
        <p>
          <strong>Inner Carcass Height:</strong> {innerCarcassHeightMm} mm
        </p>
        <p>
          <strong>Opening Count:</strong> {openingCount}
        </p>
        <p>
          <strong>Each Shelf Width:</strong> {shelfEachWidthMm} mm
        </p>
        <p>
          <strong>Partition Height:</strong> {partitionHeightMm} mm
        </p>
        <p>
          <strong>Back Parts:</strong> {formData.backParts}
        </p>
        <p>
          <strong>Recommended Back Parts:</strong> {recommendedBackParts}
        </p>
        <p>
          <strong>Each Back Panel Width:</strong> {backPanelEachWidthMm} mm
        </p>
        <p>
          <strong>Door Leaf Width:</strong> {doorLeafWidthMm} mm
        </p>
        <p>
          <strong>Door Leaf Height:</strong> {doorLeafHeightMm} mm
        </p>
        <p>
          <strong>Door Leaf Qty:</strong> {doorLeafQty}
        </p>
        <p>
          <strong>Laminate Amount:</strong> {laminateAmount}
        </p>
        <p>
          <strong>Edge Band Amount:</strong> {edgeBandAmount}
        </p>
        <p>
          <strong>Hardware Amount:</strong> {hardwareAmount}
        </p>
        <p>
          <strong>Estimated Sub Total:</strong> {estimatedSubTotal}
        </p>
      </SectionCard>

      <SectionCard title="Generated Parts (mm)">
        <table border="1" cellPadding="10" cellSpacing="0" width="100%">
          <thead>
            <tr>
              <th>ID</th>
              <th>Part Name</th>
              <th>Height (mm)</th>
              <th>Width (mm)</th>
              <th>Qty</th>
              <th>Material</th>
              <th>Total Area (sq mm)</th>
              <th>Sheet Fit</th>
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr
                key={part.id}
                style={!part.fitsInSheet ? { background: "#fef2f2" } : {}}
              >
                <td>{part.id}</td>
                <td>{part.partName}</td>
                <td>{part.lengthMm}</td>
                <td>{part.widthMm}</td>
                <td>{part.qty}</td>
                <td>{part.material}</td>
                <td>{part.totalAreaSqMm}</td>
                <td>{part.fitsInSheet ? "OK" : "Exceeds Sheet"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
    </div>
  );
}

export default WardrobeConfigurator;