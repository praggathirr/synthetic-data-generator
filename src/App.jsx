import { useState } from "react";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import Plot from "react-plotly.js";
import fs from "fs";
import "./App.css"; // Import our new CSS file

export default function RandomDataGenerator() {
  const [numRows, setNumRows] = useState(10);
  const [variables, setVariables] = useState([]);
  const [generatedData, setGeneratedData] = useState([]);
  const [selectedVar, setSelectedVar] = useState(null);
  const [compareVars, setCompareVars] = useState([]);
  const [dataGenerated, setDataGenerated] = useState(false);
  const [showPlot, setShowPlot] = useState(false);
  const [correlations, setCorrelations] = useState([]);

  const variableTypes = ["Integer", "Float", "String", "Boolean"];

  const addVariable = () => {
    setVariables([
      ...variables,
      {
        name: "",
        type: "Integer",
        min: 0,
        max: 100,
        targetMean: null,
        targetMedian: null,
        useConstraints: false,
      },
    ]);
  };

  const updateVariable = (index, key, value) => {
    const newVariables = [...variables];
    newVariables[index][key] = value;
    setVariables(newVariables);
  };

  const toggleConstraints = (index) => {
    const newVariables = [...variables];
    newVariables[index].useConstraints = !newVariables[index].useConstraints;
    setVariables(newVariables);
  };

  // Add a correlation between two variables
  const addCorrelation = () => {
    setCorrelations([
      ...correlations,
      {
        var1: "",
        var2: "",
        value: 0,
      },
    ]);
  };

  // Update a correlation setting
  const updateCorrelation = (index, key, value) => {
    const newCorrelations = [...correlations];
    newCorrelations[index][key] = value;
    setCorrelations(newCorrelations);
  };

  // Remove a correlation setting
  const removeCorrelation = (index) => {
    const newCorrelations = [...correlations];
    newCorrelations.splice(index, 1);
    setCorrelations(newCorrelations);
  };

  // Function to generate correlated random values
  const generateCorrelatedPair = (
    mean1,
    mean2,
    stdDev1,
    stdDev2,
    correlation,
    length
  ) => {
    const independent1 = Array.from({ length }, () => Math.random());
    const independent2 = Array.from({ length }, () => Math.random());

    // Box-Muller transform for normal distribution
    const normal1 = independent1.map((r) =>
      Math.sqrt(-2 * Math.log(r)) *
      Math.cos(
        2 * Math.PI * independent2[independent1.indexOf(r)]
      )
    );
    const normal2 = independent1.map((r) =>
      Math.sqrt(-2 * Math.log(r)) *
      Math.sin(
        2 * Math.PI * independent2[independent1.indexOf(r)]
      )
    );

    // Create correlated variable
    const correlated = normal1.map(
      (x, i) => correlation * x + Math.sqrt(1 - correlation * correlation) * normal2[i]
    );

    // Scale/shift to desired mean/std
    const scaled1 = normal1.map((x) => x * stdDev1 + mean1);
    const scaled2 = correlated.map((x) => x * stdDev2 + mean2);

    return [scaled1, scaled2];
  };

  // Adjust array to a target mean
  const adjustToTargetMean = (arr, targetMean) => {
    const currentMean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
    const adjustment = targetMean - currentMean;
    return arr.map((val) => val + adjustment);
  };

  // Adjust array to a target median
  const adjustToTargetMedian = (arr, targetMedian) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const currentMedian =
      arr.length % 2 === 0
        ? (sorted[arr.length / 2 - 1] + sorted[arr.length / 2]) / 2
        : sorted[Math.floor(arr.length / 2)];

    const adjustment = targetMedian - currentMedian;
    return arr.map((val) => val + adjustment);
  };

  const generateData = () => {
    // Identify all numeric variables
    const numericVars = variables
      .filter((v) => v.type === "Integer" || v.type === "Float")
      .map((v) => v.name);

    // Build a correlation matrix for all numeric variables
    const correlationMatrix = {};
    numericVars.forEach((v1) => {
      correlationMatrix[v1] = {};
      numericVars.forEach((v2) => {
        correlationMatrix[v1][v2] = v1 === v2 ? 1.0 : 0.0; // identity by default
      });
    });

    // Fill in the correlation matrix with specified correlations
    for (const corr of correlations) {
      if (
        corr.var1 &&
        corr.var2 &&
        numericVars.includes(corr.var1) &&
        numericVars.includes(corr.var2) &&
        corr.var1 !== corr.var2
      ) {
        const corrValue = parseFloat(corr.value);
        correlationMatrix[corr.var1][corr.var2] = corrValue;
        correlationMatrix[corr.var2][corr.var1] = corrValue; // symmetrical
      }
    }

    // Prepare data array
    let data = Array.from({ length: numRows }, () => ({}));

    // Generate non-numeric variables
    variables.forEach(({ name, type }) => {
      if (type === "String") {
        data.forEach((row) => {
          row[name] = Math.random().toString(36).substring(7);
        });
      } else if (type === "Boolean") {
        data.forEach((row) => {
          row[name] = Math.random() < 0.5;
        });
      }
    });

    // Create standard normal variables for each numeric var
    const standardNormals = {};
    numericVars.forEach((varName) => {
      standardNormals[varName] = Array.from({ length: numRows }, () => {
        const u1 = Math.random();
        const u2 = Math.random();
        return (
          Math.sqrt(-2 * Math.log(u1)) *
          Math.cos(2 * Math.PI * u2)
        );
      });
    });

    // Apply simplified correlation approach (pairwise) using the matrix
    for (const var1 of numericVars) {
      for (const var2 of numericVars) {
        if (var1 !== var2 && correlationMatrix[var1][var2] !== 0) {
          const rho = correlationMatrix[var1][var2];
          standardNormals[var2] = standardNormals[var2].map((z2, i) => {
            const x1 = standardNormals[var1][i];
            return rho * x1 + Math.sqrt(1 - rho * rho) * z2;
          });
        }
      }
    }

    // Convert standard normal to range [min, max] for each numeric variable
    numericVars.forEach((varName) => {
      const varInfo = variables.find((v) => v.name === varName);
      const { min, max, type, targetMean, targetMedian, useConstraints } =
        varInfo;

      // If Math.erf is missing, define it (for normal CDF approximation)
      if (!Math.erf) {
        Math.erf = function (x) {
          const a1 = 0.254829592;
          const a2 = -0.284496736;
          const a3 = 1.421413741;
          const a4 = -1.453152027;
          const a5 = 1.061405429;
          const p = 0.3275911;

          const sign = x < 0 ? -1 : 1;
          x = Math.abs(x);

          const t = 1.0 / (1.0 + p * x);
          const y =
            (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) *
            t;
          return sign * (1 - y * Math.exp(-x * x));
        };
      }

      // Convert standard normal to uniform [0,1] via CDF
      let values = standardNormals[varName].map((z) => {
        const uniform = 0.5 * (1 + Math.erf(z / Math.sqrt(2)));
        return min + (max - min) * uniform;
      });

      // Apply constraints
      if (useConstraints) {
        if (targetMean !== null && !isNaN(targetMean)) {
          values = adjustToTargetMean(values, parseFloat(targetMean));
        }
        if (targetMedian !== null && !isNaN(targetMedian)) {
          values = adjustToTargetMedian(values, parseFloat(targetMedian));
        }
      }

      // Ensure bounds
      values = values.map((val) => {
        let bounded = Math.max(min, Math.min(max, val));
        return type === "Integer"
          ? Math.round(bounded)
          : parseFloat(bounded.toFixed(2));
      });

      // Assign
      values.forEach((val, i) => {
        data[i][varName] = val;
      });
    });

    setGeneratedData(data);
    setDataGenerated(true);

    // Save CSV file automatically
    const csv = Papa.unparse(data);
    try {
      fs.writeFileSync("src/generated_data.csv", csv);
    } catch (err) {
      console.error("Error writing file:", err);
    }
  };

  const downloadCSV = () => {
    const csv = Papa.unparse(generatedData);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "generated_data.csv");
  };

  const toggleCompareVariable = (varName) => {
    setCompareVars((prev) => {
      const updatedVars = prev.includes(varName)
        ? prev.filter((v) => v !== varName)
        : prev.length < 2
        ? [...prev, varName]
        : prev;
      return updatedVars;
    });
  };

  const handlePlot = () => {
    if (compareVars.length === 2) setShowPlot(true);
  };

  const computeStatistics = (data, type) => {
    if (type === "Boolean") {
      const trueCount = data.filter((val) => val).length;
      const falseCount = data.length - trueCount;
      return { trueCount, falseCount };
    }

    if (type === "Integer" || type === "Float") {
      const sortedData = [...data].sort((a, b) => a - b);
      const min = sortedData[0];
      const max = sortedData[sortedData.length - 1];
      const mean = (
        data.reduce((sum, val) => sum + val, 0) / data.length
      ).toFixed(2);

      const median =
        data.length % 2 === 0
          ? (
              (sortedData[data.length / 2 - 1] +
                sortedData[data.length / 2]) /
              2
            ).toFixed(2)
          : sortedData[Math.floor(data.length / 2)];

      return { min, max, mean, median };
    }

    return null;
  };

  const renderSingleVariablePlot = () => {
    if (!selectedVar) return null;
    const data = generatedData.map((row) => row[selectedVar]);
    const variableType = variables.find((v) => v.name === selectedVar)?.type;

    if (!data.length) return null;

    const stats = computeStatistics(data, variableType);

    return (
      <div style={{ marginTop: "20px" }}>
        {variableType === "Boolean" ? (
          <>
            <Plot
              data={[
                {
                  x: ["False", "True"],
                  y: [stats.falseCount, stats.trueCount],
                  type: "bar",
                  marker: { color: ["#BF616A", "#A3BE8C"] },
                  width: 0.5,
                },
              ]}
              layout={{
                paper_bgcolor: "#2E3440",
                plot_bgcolor: "#2E3440",
                font: { color: "#ECEFF4" },
                title: `Boolean Distribution: ${selectedVar}`,
                xaxis: { title: "Value" },
                yaxis: { title: "Count" },
                bargap: 0.2,
              }}
            />
            <p>
              <strong>True Count:</strong> {stats.trueCount}
            </p>
            <p>
              <strong>False Count:</strong> {stats.falseCount}
            </p>
          </>
        ) : (
          <>
            <Plot
              data={[
                {
                  x: data,
                  type: "histogram",
                  marker: { color: "#5E81AC" },
                },
              ]}
              layout={{
                paper_bgcolor: "#2E3440",
                plot_bgcolor: "#2E3440",
                font: { color: "#ECEFF4" },
                title: `Distribution of ${selectedVar}`,
                xaxis: { title: selectedVar },
                yaxis: { title: "Frequency" },
                bargap: 0.2,
              }}
            />
            <p>
              <strong>Min:</strong> {stats.min}
            </p>
            <p>
              <strong>Max:</strong> {stats.max}
            </p>
            <p>
              <strong>Mean:</strong> {stats.mean}
            </p>
            <p>
              <strong>Median:</strong> {stats.median}
            </p>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="container">
      <h2 className="title">Random Data Generator</h2>

      <div className="card">
        <label className="label-bold">Number of Rows</label>
        <input
          type="number"
          value={numRows}
          onChange={(e) => setNumRows(parseInt(e.target.value, 10) || 0)}
          className="input"
        />
        <button onClick={addVariable} className="btn">
          Add Variable
        </button>
      </div>

      {variables.map((variable, index) => (
        <div key={index} className="card">
          <label className="label-bold">Variable Name</label>
          <input
            type="text"
            placeholder="Variable Name"
            value={variable.name}
            onChange={(e) => updateVariable(index, "name", e.target.value)}
            className="input"
          />
          <label className="label-bold">Type</label>
          <select
            value={variable.type}
            onChange={(e) => updateVariable(index, "type", e.target.value)}
            className="input"
          >
            {variableTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          {(variable.type === "Integer" || variable.type === "Float") && (
            <>
              <div className="flex-container" style={{ marginTop: "5px" }}>
                <div>
                  <label className="label-bold">Min</label>
                  <input
                    type="number"
                    placeholder="Min"
                    value={variable.min}
                    onChange={(e) =>
                      updateVariable(index, "min", parseFloat(e.target.value) || 0)
                    }
                    className="input"
                  />
                </div>
                <div>
                  <label className="label-bold">Max</label>
                  <input
                    type="number"
                    placeholder="Max"
                    value={variable.max}
                    onChange={(e) =>
                      updateVariable(index, "max", parseFloat(e.target.value) || 100)
                    }
                    className="input"
                  />
                </div>
              </div>

              <div style={{ marginTop: "10px" }}>
                <label className="label-bold" style={{ display: "flex", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={variable.useConstraints}
                    onChange={() => toggleConstraints(index)}
                    style={{ marginRight: "5px" }}
                  />
                  Use Statistical Constraints
                </label>

                {variable.useConstraints && (
                  <div style={{ marginLeft: "20px", marginTop: "10px" }}>
                    <div style={{ marginBottom: "5px" }}>
                      <label className="label-bold">Target Mean:</label>
                      <input
                        type="number"
                        placeholder="Target Mean"
                        value={variable.targetMean || ""}
                        onChange={(e) =>
                          updateVariable(
                            index,
                            "targetMean",
                            e.target.value === "" ? null : parseFloat(e.target.value)
                          )
                        }
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label-bold">Target Median:</label>
                      <input
                        type="number"
                        placeholder="Target Median"
                        value={variable.targetMedian || ""}
                        onChange={(e) =>
                          updateVariable(
                            index,
                            "targetMedian",
                            e.target.value === "" ? null : parseFloat(e.target.value)
                          )
                        }
                        className="input"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ))}

      {/* Correlation settings section */}
      <div className="card">
        <h3 className="section-title">Variable Correlations</h3>

        <button onClick={addCorrelation} className="btn" style={{ marginBottom: "10px" }}>
          Add Correlation
        </button>

        {correlations.map((correlation, index) => (
          <div key={index} className="flex-container" style={{ marginBottom: "10px" }}>
            <select
              value={correlation.var1}
              onChange={(e) => updateCorrelation(index, "var1", e.target.value)}
              className="input"
              style={{ flex: 1 }}
            >
              <option value="">Select Variable 1</option>
              {variables
                .filter((v) => v.type === "Integer" || v.type === "Float")
                .map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
            </select>

            <span style={{ alignSelf: "center" }}>correlates with</span>

            <select
              value={correlation.var2}
              onChange={(e) => updateCorrelation(index, "var2", e.target.value)}
              className="input"
              style={{ flex: 1 }}
            >
              <option value="">Select Variable 2</option>
              {variables
                .filter((v) => v.type === "Integer" || v.type === "Float")
                .map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
            </select>

            <div className="flex-container" style={{ alignItems: "center", flex: 1 }}>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={correlation.value}
                onChange={(e) => updateCorrelation(index, "value", e.target.value)}
                className="slider"
              />
              <span style={{ width: "30px", textAlign: "center" }}>
                {parseFloat(correlation.value).toFixed(1)}
              </span>
            </div>

            <button onClick={() => removeCorrelation(index)} className="remove-btn">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex-container" style={{ marginBottom: "20px" }}>
        <button onClick={generateData} className="btn-generate">
          Generate Data
        </button>
        <button onClick={downloadCSV} className="btn-download">
          Download CSV
        </button>
      </div>

      {dataGenerated && (
        <>
          <h3>Select a Variable to Plot:</h3>
          <div style={{ marginBottom: "20px" }}>
            {variables.map((variable) => {
              const selected = selectedVar === variable.name;
              return (
                <button
                  key={variable.name}
                  onClick={() => setSelectedVar(variable.name)}
                  className={selected ? "btn-var-selected" : "btn-var-unselected"}
                >
                  {variable.name}
                </button>
              );
            })}
          </div>

          {renderSingleVariablePlot()}

          <h3>Select Two Numeric Variables to Compare:</h3>
          <div style={{ marginBottom: "20px" }}>
            {variables
              .filter((v) => v.type === "Integer" || v.type === "Float")
              .map((variable) => {
                const selected = compareVars.includes(variable.name);
                return (
                  <button
                    key={variable.name}
                    onClick={() => toggleCompareVariable(variable.name)}
                    className={selected ? "btn-var-selected" : "btn-var-unselected"}
                  >
                    {variable.name}
                  </button>
                );
              })}
          </div>

          <button
            onClick={handlePlot}
            disabled={compareVars.length !== 2}
            className={
              compareVars.length === 2
                ? "scatter-btn-enabled"
                : "scatter-btn-disabled"
            }
          >
            Plot Scatter
          </button>

          {showPlot && compareVars.length === 2 && (
            <div style={{ marginTop: "20px" }}>
              <Plot
                data={[
                  {
                    x: generatedData.map((row) => row[compareVars[0]]),
                    y: generatedData.map((row) => row[compareVars[1]]),
                    mode: "markers",
                    type: "scatter",
                    marker: { color: "#BF616A" },
                  },
                ]}
                layout={{
                  paper_bgcolor: "#2E3440",
                  plot_bgcolor: "#2E3440",
                  font: { color: "#ECEFF4" },
                  title: `Scatter Plot: ${compareVars[0]} vs ${compareVars[1]}`,
                  xaxis: { title: compareVars[0] },
                  yaxis: { title: compareVars[1] },
                }}
              />
              <p style={{ textAlign: "center" }}>
                Correlation:{" "}
                {calculateCorrelation(
                  generatedData.map((row) => row[compareVars[0]]),
                  generatedData.map((row) => row[compareVars[1]])
                ).toFixed(2)}
              </p>
            </div>
          )}

          {/* Display the generated data table (up to 50 rows) */}
          <div style={{ marginTop: "40px" }}>
            <h3>Generated Data Preview (max 50 rows)</h3>
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    {variables.map((variable) => (
                      <th key={variable.name}>{variable.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {generatedData.slice(0, 50).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {variables.map((variable) => (
                        <td key={variable.name}>
                          {row[variable.name]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Utility function to calculate the actual correlation between two arrays
function calculateCorrelation(x, y) {
  const n = x.length;

  // Calculate means
  const xMean = x.reduce((sum, val) => sum + val, 0) / n;
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;

  // Calculate covariance and variances
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;

  for (let i = 0; i < n; i++) {
    const xDiff = x[i] - xMean;
    const yDiff = y[i] - yMean;
    covariance += xDiff * yDiff;
    xVariance += xDiff * xDiff;
    yVariance += yDiff * yDiff;
  }

  // Pearson correlation coefficient
  return covariance / (Math.sqrt(xVariance) * Math.sqrt(yVariance));
}
