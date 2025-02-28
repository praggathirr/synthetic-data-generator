import { useState } from "react";
import { saveAs } from "file-saver";
import Papa from "papaparse";
import Plot from 'react-plotly.js';
import fs from 'fs';

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
    setVariables([...variables, { 
      name: "", 
      type: "Integer", 
      min: 0, 
      max: 100,
      targetMean: null,
      targetMedian: null,
      useConstraints: false
    }]);
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
    setCorrelations([...correlations, {
      var1: "",
      var2: "",
      value: 0
    }]);
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
  const generateCorrelatedPair = (mean1, mean2, stdDev1, stdDev2, correlation, length) => {
    // Generate two sets of independent random numbers
    const independent1 = Array.from({ length }, () => Math.random());
    const independent2 = Array.from({ length }, () => Math.random());
    
    // Apply Box-Muller transform to get normal distribution
    const normal1 = independent1.map(r => Math.sqrt(-2 * Math.log(r)) * Math.cos(2 * Math.PI * independent2[independent1.indexOf(r)]));
    const normal2 = independent1.map(r => Math.sqrt(-2 * Math.log(r)) * Math.sin(2 * Math.PI * independent2[independent1.indexOf(r)]));
    
    // Create correlated variable
    const correlated = normal1.map((x, i) => correlation * x + Math.sqrt(1 - correlation * correlation) * normal2[i]);
    
    // Scale and shift to desired mean and standard deviation
    const scaled1 = normal1.map(x => x * stdDev1 + mean1);
    const scaled2 = correlated.map(x => x * stdDev2 + mean2);
    
    return [scaled1, scaled2];
  };

  // Utility function to adjust an array to match a target mean
  const adjustToTargetMean = (arr, targetMean) => {
    const currentMean = arr.reduce((sum, val) => sum + val, 0) / arr.length;
    const adjustment = targetMean - currentMean;
    return arr.map(val => val + adjustment);
  };

  // Utility function to adjust an array to match a target median
  const adjustToTargetMedian = (arr, targetMedian) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const currentMedian = arr.length % 2 === 0 
      ? (sorted[arr.length / 2 - 1] + sorted[arr.length / 2]) / 2
      : sorted[Math.floor(arr.length / 2)];
    
    const adjustment = targetMedian - currentMedian;
    return arr.map(val => val + adjustment);
  };

  const generateData = () => {
    // First, identify all numeric variables
    const numericVars = variables.filter(v => 
      v.type === "Integer" || v.type === "Float"
    ).map(v => v.name);
    
    // Build a correlation matrix for all numeric variables
    const correlationMatrix = {};
    numericVars.forEach(v1 => {
      correlationMatrix[v1] = {};
      numericVars.forEach(v2 => {
        correlationMatrix[v1][v2] = v1 === v2 ? 1.0 : 0.0; // Initialize with identity matrix
      });
    });
    
    // Fill in the correlation matrix with specified correlations
    for (const corr of correlations) {
      if (corr.var1 && corr.var2 && 
          numericVars.includes(corr.var1) && 
          numericVars.includes(corr.var2) &&
          corr.var1 !== corr.var2) {
        const corrValue = parseFloat(corr.value);
        correlationMatrix[corr.var1][corr.var2] = corrValue;
        correlationMatrix[corr.var2][corr.var1] = corrValue; // Correlation is symmetric
      }
    }
    
    // Initialize data structure
    let data = Array.from({ length: numRows }, () => ({}));
    
    // Generate non-numeric variables first
    variables.forEach(({ name, type, min, max }) => {
      if (type === "String") {
        data.forEach(row => {
          row[name] = Math.random().toString(36).substring(7);
        });
      } else if (type === "Boolean") {
        data.forEach(row => {
          row[name] = Math.random() < 0.5;
        });
      }
    });
    
    // Now handle numeric variables with correlations
    // Create a map to store standard normal variables for each numeric var
    const standardNormals = {};
    
    // First, generate independent standard normal variables for each numeric variable
    numericVars.forEach(varName => {
      standardNormals[varName] = Array.from({ length: numRows }, () => {
        // Box-Muller transform to get standard normal
        const u1 = Math.random();
        const u2 = Math.random();
        return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      });
    });
    
    // Apply Cholesky decomposition to create correlated variables
    // Using a simplified approach for the 2-variable case
    // For each pair of variables with non-zero correlation
    for (const var1 of numericVars) {
      for (const var2 of numericVars) {
        if (var1 !== var2 && correlationMatrix[var1][var2] !== 0) {
          const rho = correlationMatrix[var1][var2];
          
          // Adjust the second variable based on correlation with the first
          // X2 = rho * X1 + sqrt(1 - rho^2) * Z2
          standardNormals[var2] = standardNormals[var2].map((z2, i) => {
            const x1 = standardNormals[var1][i];
            return rho * x1 + Math.sqrt(1 - rho * rho) * z2;
          });
        }
      }
    }
    
    // Convert standard normal variables to the desired distributions
    numericVars.forEach(varName => {
      const varInfo = variables.find(v => v.name === varName);
      const { min, max, type, targetMean, targetMedian, useConstraints } = varInfo;
      
      // Transform standard normal to the desired range
      let values = standardNormals[varName].map(z => {
        // Convert standard normal to uniform via CDF approximation
        const uniform = 0.5 * (1 + Math.erf(z / Math.sqrt(2)));
        // Transform uniform to desired range
        return min + (max - min) * uniform;
      });
      
      // Apply constraints if needed
      if (useConstraints) {
        if (targetMean !== null && !isNaN(targetMean)) {
          values = adjustToTargetMean(values, parseFloat(targetMean));
        }
        
        if (targetMedian !== null && !isNaN(targetMedian)) {
          values = adjustToTargetMedian(values, parseFloat(targetMedian));
        }
      }
      
      // Ensure values stay within min-max bounds
      values = values.map(val => {
        let bounded = Math.max(min, Math.min(max, val));
        return type === "Integer" ? Math.round(bounded) : parseFloat(bounded.toFixed(2));
      });
      
      // Assign to data rows
      values.forEach((val, i) => {
        data[i][varName] = val;
      });
    });
    
    setGeneratedData(data);
    setDataGenerated(true);
  
    // Save CSV file
    const csv = Papa.unparse(data);
    try {
      fs.writeFileSync("src/generated_data.csv", csv);
    } catch (err) {
      console.error("Error writing file:", err);
    }
  };
  
  // Add Math.erf if not available (for standard normal CDF)
  if (!Math.erf) {
    Math.erf = function(x) {
      // constants
      const a1 =  0.254829592;
      const a2 = -0.284496736;
      const a3 =  1.421413741;
      const a4 = -1.453152027;
      const a5 =  1.061405429;
      const p  =  0.3275911;
  
      // Save the sign of x
      const sign = x < 0 ? -1 : 1;
      x = Math.abs(x);
  
      // A&S formula 7.1.26
      const t = 1.0 / (1.0 + p * x);
      const y = (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t;
  
      return sign * (1 - y * Math.exp(-x * x));
    };
  }

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
      const trueCount = data.filter(val => val).length;
      const falseCount = data.length - trueCount;
      return { trueCount, falseCount };
    }
  
    if (type === "Integer" || type === "Float") {
      const sortedData = [...data].sort((a, b) => a - b);
      const min = sortedData[0];
      const max = sortedData[sortedData.length - 1];
      const mean = (data.reduce((sum, val) => sum + val, 0) / data.length).toFixed(2);
      
      const median =
        data.length % 2 === 0
          ? ((sortedData[data.length / 2 - 1] + sortedData[data.length / 2]) / 2).toFixed(2)
          : sortedData[Math.floor(data.length / 2)];
  
      return { min, max, mean, median };
    }
  
    return null;
  };

  const renderSingleVariablePlot = () => {
    if (!selectedVar) return null;
    const data = generatedData.map(row => row[selectedVar]);
    const variableType = variables.find(v => v.name === selectedVar)?.type;
  
    if (!data.length) return null;
  
    const stats = computeStatistics(data, variableType);
  
    return (
      <div>
        {variableType === "Boolean" ? (
          <>
            <Plot
              data={[
                {
                  x: ["False", "True"],
                  y: [stats.falseCount, stats.trueCount],
                  type: "bar",
                  marker: { color: ["red", "green"] },
                  width: 0.5
                },
              ]}
              layout={{
                title: `Boolean Distribution: ${selectedVar}`,
                xaxis: { title: "Value" },
                yaxis: { title: "Count" },
                bargap: 0.2
              }}
            />
            <p>True Count: {stats.trueCount}</p>
            <p>False Count: {stats.falseCount}</p>
          </>
        ) : (
          <>
            <Plot
              data={[
                {
                  x: data,
                  type: "histogram",
                  marker: { color: "blue" },
                },
              ]}
              layout={{
                title: `Distribution of ${selectedVar}`,
                xaxis: { title: selectedVar },
                yaxis: { title: "Frequency" },
                bargap: 0.2
              }}
            />
            <p>Min: {stats.min}</p>
            <p>Max: {stats.max}</p>
            <p>Mean: {stats.mean}</p>
            <p>Median: {stats.median}</p>
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px" }}>
        <label>Number of Rows</label>
        <input
          type="number"
          value={numRows}
          onChange={(e) => setNumRows(parseInt(e.target.value, 10) || 0)}
          style={{ display: "block", margin: "5px 0", padding: "5px" }}
        />
        <button onClick={addVariable} style={{ padding: "5px 10px", backgroundColor: "blue", color: "white", border: "none" }}>
          Add Variable
        </button>
      </div>

      {variables.map((variable, index) => (
        <div key={index} style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px" }}>
          <input
            type="text"
            placeholder="Variable Name"
            value={variable.name}
            onChange={(e) => updateVariable(index, "name", e.target.value)}
            style={{ display: "block", margin: "5px 0", padding: "5px" }}
          />
          <select
            value={variable.type}
            onChange={(e) => updateVariable(index, "type", e.target.value)}
            style={{ display: "block", margin: "5px 0", padding: "5px" }}
          >
            {variableTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          {(variable.type === "Integer" || variable.type === "Float") && (
            <>
              <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                <input
                  type="number"
                  placeholder="Min"
                  value={variable.min}
                  onChange={(e) => updateVariable(index, "min", parseFloat(e.target.value) || 0)}
                  style={{ padding: "5px", width: "45%" }}
                />
                <input
                  type="number"
                  placeholder="Max"
                  value={variable.max}
                  onChange={(e) => updateVariable(index, "max", parseFloat(e.target.value) || 100)}
                  style={{ padding: "5px", width: "45%" }}
                />
              </div>
              
              <div style={{ marginTop: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", cursor: "pointer", marginBottom: "10px" }}>
                  <input 
                    type="checkbox" 
                    checked={variable.useConstraints} 
                    onChange={() => toggleConstraints(index)}
                    style={{ marginRight: "5px" }}
                  />
                  Use Statistical Constraints
                </label>
                
                {variable.useConstraints && (
                  <div style={{ marginLeft: "20px" }}>
                    <div style={{ marginBottom: "5px" }}>
                      <label>Target Mean:</label>
                      <input
                        type="number"
                        placeholder="Target Mean"
                        value={variable.targetMean || ""}
                        onChange={(e) => updateVariable(index, "targetMean", e.target.value === "" ? null : parseFloat(e.target.value))}
                        style={{ padding: "5px", width: "100%", marginTop: "5px" }}
                      />
                    </div>
                    <div>
                      <label>Target Median:</label>
                      <input
                        type="number"
                        placeholder="Target Median"
                        value={variable.targetMedian || ""}
                        onChange={(e) => updateVariable(index, "targetMedian", e.target.value === "" ? null : parseFloat(e.target.value))}
                        style={{ padding: "5px", width: "100%", marginTop: "5px" }}
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
      <div style={{ border: "1px solid #ccc", padding: "10px", marginBottom: "10px" }}>
        <h3>Variable Correlations</h3>
        
        <button 
          onClick={addCorrelation} 
          style={{ 
            padding: "5px 10px", 
            backgroundColor: "purple", 
            color: "white", 
            border: "none",
            marginBottom: "10px" 
          }}
        >
          Add Correlation
        </button>
        
        {correlations.map((correlation, index) => (
          <div key={index} style={{ 
            display: "flex", 
            gap: "10px", 
            alignItems: "center",
            marginBottom: "10px",
            padding: "10px",
            backgroundColor: "#f5f5f5",
            borderRadius: "5px"
          }}>
            <select
              value={correlation.var1}
              onChange={(e) => updateCorrelation(index, "var1", e.target.value)}
              style={{ padding: "5px", flex: 1 }}
            >
              <option value="">Select Variable 1</option>
              {variables
                .filter(v => v.type === "Integer" || v.type === "Float")
                .map(v => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))
              }
            </select>
            
            <span>correlates with</span>
            
            <select
              value={correlation.var2}
              onChange={(e) => updateCorrelation(index, "var2", e.target.value)}
              style={{ padding: "5px", flex: 1 }}
            >
              <option value="">Select Variable 2</option>
              {variables
                .filter(v => v.type === "Integer" || v.type === "Float")
                .map(v => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))
              }
            </select>
            
            <div style={{ display: "flex", alignItems: "center", flex: 1 }}>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={correlation.value}
                onChange={(e) => updateCorrelation(index, "value", e.target.value)}
                style={{ flex: 2 }}
              />
              <span style={{ width: "30px", textAlign: "center" }}>
                {parseFloat(correlation.value).toFixed(1)}
              </span>
            </div>
            
            <button
              onClick={() => removeCorrelation(index)}
              style={{ 
                padding: "3px 8px", 
                backgroundColor: "red", 
                color: "white", 
                border: "none",
                borderRadius: "3px"
              }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button onClick={generateData} style={{ padding: "5px 10px", backgroundColor: "green", color: "white", border: "none" }}>
        Generate Data
      </button>
      <button onClick={downloadCSV} style={{ marginLeft: "10px", padding: "5px 10px", backgroundColor: "orange", color: "white", border: "none" }}>
        Download CSV
      </button>

      {dataGenerated && (
        <>
          <h3>Select a Variable to Plot:</h3>
          {variables.map((variable) => (
            <button
              key={variable.name}
              onClick={() => setSelectedVar(variable.name)}
              style={{
                margin: "5px",
                padding: "10px",
                backgroundColor: selectedVar === variable.name ? "lightblue" : "black",
                color: "white",
                border: "none",
              }}
            >
              {variable.name}
            </button>
          ))}
          {renderSingleVariablePlot()}
        
          <h3>Select Two Numeric Variables to Compare:</h3>
          {variables
            .filter((v) => v.type === "Integer" || v.type === "Float")
            .map((variable) => (
              <button
                key={variable.name}
                onClick={() => toggleCompareVariable(variable.name)}
                style={{
                  margin: "5px",
                  padding: "10px",
                  backgroundColor: compareVars.includes(variable.name) ? "lightblue" : "black",
                  color: "white",
                  border: "none",
                }}
              >
                {variable.name}
              </button>
            ))}

          <button
            onClick={handlePlot}
            disabled={compareVars.length !== 2}
            style={{
              display: "block",
              marginTop: "10px",
              padding: "10px",
              backgroundColor: compareVars.length === 2 ? "purple" : "gray",
              color: "white",
              border: "none",
              cursor: compareVars.length === 2 ? "pointer" : "not-allowed",
            }}
          >
            Plot Scatter
          </button>

          {showPlot && compareVars.length === 2 && (
            <div>
              <Plot
                data={[
                  {
                    x: generatedData.map((row) => row[compareVars[0]]),
                    y: generatedData.map((row) => row[compareVars[1]]),
                    mode: "markers",
                    type: "scatter",
                    marker: { color: "red" },
                  },
                ]}
                layout={{
                  title: `Scatter Plot: ${compareVars[0]} vs ${compareVars[1]}`,
                  xaxis: { title: compareVars[0] },
                  yaxis: { title: compareVars[1] },
                }}
              />
              <p style={{ textAlign: "center" }}>
                Correlation: {
                  calculateCorrelation(
                    generatedData.map((row) => row[compareVars[0]]),
                    generatedData.map((row) => row[compareVars[1]])
                  ).toFixed(2)
                }
              </p>
            </div>
          )}
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
  
  // Calculate Pearson correlation coefficient
  return covariance / (Math.sqrt(xVariance) * Math.sqrt(yVariance));
}