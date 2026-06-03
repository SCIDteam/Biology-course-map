function adjustSVGSize() {
    const svg = document.getElementById("mySVG");
    const mainDiv = document.getElementById("main");

    // Get main div dimensions
    const mainWidth = mainDiv.clientWidth;
    const mainHeight = mainDiv.clientHeight;

    // Set SVG dimensions
    svg.setAttribute("width", mainWidth);
    svg.setAttribute("height", mainHeight);
}

// Call the function on page load
window.onload = adjustSVGSize;

// Adjust SVG size on window resize
window.onresize = adjustSVGSize;

d3.json('data_extract/data/all_courses_py.json').then(coursesData => {

    const subjects = [...new Set(coursesData.map(course => course.course_code.slice(0, 4)))];
    const themes = [...new Set(coursesData.flatMap(course => course.themes))];
    const levels = [...new Set(coursesData.map(course => course.course_code.slice(5,6)*100))]
                    .sort((a, b) => a - b)
                    .map(level => `${level} level`);
    
    const dropdownButton = document.getElementById("dropdownButton");
    const dropdownContent = document.getElementById("dropdownContent");

    const themesDropdownButton = document.getElementById("dropdownButton-2");
    const themesDropdownContent = document.getElementById("dropdownContent-2");

    const levelsDropdownButton = document.getElementById("dropdownButton-3");
    const levelsDropdownContent = document.getElementById("dropdownContent-3");

    let selectedSubjects = [];
    let selectedThemes = [];
    let selectedLevel = [];
    let coreqEdgeIds = new Set(); // tracks corequisite edge IDs for correct mouseout reset

    // Create initial message text in the SVG
    const svg = d3.select("svg");

    // Set the initial message text
    const initialMessage = svg.append("text")
    .attr("id", "initialMessage")
    .attr("x", "50%")                         // Position horizontally centered
    .attr("y", "50%")                         // Position vertically centered
    .attr("dy", ".35em")                      // Adjust vertical alignment
    .attr("text-anchor", "middle")           // Center the text
    .style("font-size", "60px")              // Font size
    .style("fill", "#8B8378")                  // Text color
    .style("pointer-events", "none")         // Prevent mouse events
    .style("font-family", "Arial, sans-serif") // Use a more modern font
    .style("font-weight", "bold") // Make the text bold
    .style("filter", "url(#text-shadow)")
    .text("Filter Courses from the sidebar"); // Initial message text

    // Populate the dropdown with checkbox options
    subjects.forEach(subject => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = subject;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                if (selectedSubjects.length < 3) {
                    selectedSubjects.push(this.value);
                } else {
                    this.checked = false; // Prevent more than 3 selections
                }
            } else {
                selectedSubjects = selectedSubjects.filter(subj => subj !== this.value);
            }
            dropdownButton.textContent = `Select Subjects (${selectedSubjects.length}/3)`;
            updateGraph(selectedSubjects, selectedThemes, selectedLevel); // Update graph based on selections
        });

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(subject));
        dropdownContent.appendChild(label);
    });

    // Populate the dropdown with checkbox options
    themes.forEach(theme => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = theme;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                // Uncheck other checkboxes if this one is checked
                const checkboxes = themesDropdownContent.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    if (cb !== this) {
                        cb.checked = false; // Uncheck all other checkboxes
                    }
                });
                // Update the selected theme
                selectedThemes = [this.value]; // Set the selected theme
            } else {
                selectedThemes = []; // Clear selected theme
            }

            // Update button text based on selection
            if (selectedThemes.length > 0) {
                themesDropdownButton.textContent = `Selected Theme: ${selectedThemes[0]}`;
            } else {
                themesDropdownButton.textContent = "Select Theme"; // Reset button text when no theme is selected
            }

            // Update the graph based on the new selection
            updateGraph(selectedSubjects, selectedThemes, selectedLevel);
        });

        // Append the checkbox and label to the dropdown
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(theme));
        themesDropdownContent.appendChild(label);
    });

    // Populate the dropdown with checkbox options
    levels.forEach(level => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = level;

        checkbox.addEventListener('change', function() {
            if (this.checked) {
                // Uncheck other checkboxes if this one is checked
                const checkboxes = levelsDropdownContent.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    if (cb !== this) {
                        cb.checked = false; // Uncheck all other checkboxes
                    }
                });
                // Update the selected theme
                selectedLevel = [this.value]; // Set the selected theme
            } else {
                selectedLevel = []; // Clear selected theme
            }

            // Update button text based on selection
            if (selectedLevel.length > 0) {
                levelsDropdownButton.textContent = `Selected Level: ${selectedLevel[0]}`;
            } else {
                levelsDropdownButton.textContent = "Select Course Level"; // Reset button text when no theme is selected
            }

            // Update the graph based on the new selection
            updateGraph(selectedSubjects, selectedThemes, selectedLevel);
        });

        // Append the checkbox and label to the dropdown
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(level));
        levelsDropdownContent.appendChild(label);
    });

    // Toggle dropdown display
    dropdownButton.addEventListener('click', function() {
        dropdownContent.classList.toggle("show");
    });

    themesDropdownButton.addEventListener('click', function() {
        themesDropdownContent.classList.toggle("show");
    });

    levelsDropdownButton.addEventListener('click', function() {
        levelsDropdownContent.classList.toggle("show");
    });

    // Close dropdown if clicked outside the button and content
    document.addEventListener('click', function(event) {
        const isClickInsideButton = dropdownButton.contains(event.target);
        const isClickInsideContent = dropdownContent.contains(event.target);

        if (!isClickInsideButton && !isClickInsideContent) {
            dropdownContent.classList.remove("show");
        }
    });

    document.addEventListener('click', function(event) {
        const isClickInsideButton = themesDropdownButton.contains(event.target);
        const isClickInsideContent = themesDropdownContent.contains(event.target);

        if (!isClickInsideButton && !isClickInsideContent) {
            themesDropdownContent.classList.remove("show");
        }
    });

    document.addEventListener('click', function(event) {
        const isClickInsideButton = levelsDropdownButton.contains(event.target);
        const isClickInsideContent = levelsDropdownContent.contains(event.target);

        if (!isClickInsideButton && !isClickInsideContent) {
            levelsDropdownContent.classList.remove("show");
        }
    });

    // Create a new directed graph
    var g = new dagreD3.graphlib.Graph().setGraph({
        rankdir: 'TB',
        nodesep: 30,
        edgesep: 0,
        ranksep: 200
    });

    // Function to render the graph (updated to store filters in localStorage)
    function renderGraph(filteredCourseIds) {
        d3.select("#initialMessage").style("display", "none");

        g.nodes().forEach(function(v) {
            var node = g.node(v);
            node.rx = node.ry = 100;
        });

        var inner = svg.append("g");
        var zoom = d3.zoom().on("zoom", function(event) {
            inner.attr("transform", event.transform);
        });
        svg.call(zoom);

        var render = new dagreD3.render();
        render(inner, g);

        var initialScale = 0.6;
        var offset = 0;
        var graphWidth = g.graph().width || 0;
        var graphHeight = g.graph().height || 0;

        if (graphWidth > 0) {
            svg.call(zoom.transform, d3.zoomIdentity
                .translate((svg.attr("width") - graphWidth * initialScale) / 2 - offset, 30)
                .scale(initialScale)
            );
        } else {
            svg.call(zoom.transform, d3.zoomIdentity.scale(initialScale));
        }

        inner.selectAll("g.node").on("click", function(event, d) {
            console.log(d)
            const course = coursesData.find(course => course.course_code === d);
            if (course) {
                // Store the current filters in localStorage
                localStorage.setItem('filters', JSON.stringify({ selectedSubjects, selectedThemes, selectedLevel }));
                
                // Redirect to the course details page with the course code as a URL parameter
                window.location.href = `courseDetails.html?course_code=${d}`;
            }
        });

        // Apply color to nodes based on filtered course IDs
        inner.selectAll("g.node").select("rect")
            .style("fill", function(d) {
                return filteredCourseIds.includes(d) ? "#EEDFCC" : null;
            });

        // Create the tooltip div
        var tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);

        // Simple function to style the tooltip for the given node.
        var styleTooltip = function(name, description) {
            return "<p class='name'>" + name + "</p><p class='description'>" + description + "</p>";
        };

        // Build downstream map once per render so hover can find dependents efficiently
        const downstreamMap = buildDownstreamMap(coursesData);

        // Mouseover: highlight full upstream chain (prereqs) and full downstream chain (dependents)
        inner.selectAll("g.node").on("mouseover", function(event, d) {
            const course = coursesData.find(course => course.course_code === d);
            console.log(course.course_code)

            // Set tooltip content dynamically
            tooltip.transition().duration(10).style("opacity", 1); // Show the tooltip
            tooltip.html(`
                <div class="title">${course.course_code}</div>
                <div class="body">${styleTooltip(course.course_title, course.description)}</div>
            `);

            // Make the hovered node bold and full opacity
            d3.select(this).select("rect").style("fill", function() {
                return filteredCourseIds.includes(d) ? "#EEDFCC" : "cyan";
            });
            d3.select(this).select("text").style("font-weight", "bold");
            d3.select(this).style("opacity", 1);

            // Reduce opacity of all other nodes and edges
            inner.selectAll("g.node").filter(n => n !== d).style("opacity", 0.2);
            inner.selectAll("g.edgePath").style("opacity", 0.2);

            // Recursively highlight all upstream courses (prerequisites and corequisites)
            collectUpstreamEdges(d, coursesData).forEach(function({ from, to, type }) {
                const nodeColor = type === 'corequisite' ? 'coral' : 'cyan';
                inner.select(`g.node[id="${from}"]`).select("rect").style("fill", nodeColor);
                inner.select(`g.node[id="${from}"]`).select("text").style("font-weight", "bold");
                inner.select(`g.node[id="${from}"]`).style("opacity", 1);

                inner.select(`g.edgePath[id*="${from}-${to}"]`).style("opacity", 1)
                    .select("path")
                    .style("stroke-width", "3px")
                    .style("stroke", type === 'corequisite' ? 'coral' : 'black')
                    .style("stroke-dasharray", type === 'corequisite' ? "5, 5" : null);
            });

            // Recursively highlight all downstream courses (courses that depend on this one)
            collectDownstreamEdges(d, downstreamMap).forEach(function({ from, to, type }) {
                inner.select(`g.node[id="${to}"]`).select("rect").style("fill", "#90EE90");
                inner.select(`g.node[id="${to}"]`).select("text").style("font-weight", "bold");
                inner.select(`g.node[id="${to}"]`).style("opacity", 1);

                inner.select(`g.edgePath[id*="${from}-${to}"]`).style("opacity", 1)
                    .select("path")
                    .style("stroke-width", "3px")
                    .style("stroke", "#228B22")
                    .style("stroke-dasharray", type === 'corequisite' ? "5, 5" : null);
            });
        })
        .on("mousemove", function (event) {
            // Position the tooltip relative to the viewport
            const tooltipWidth = tooltip.node().offsetWidth;
            const tooltipHeight = tooltip.node().offsetHeight;
    
            const x = event.clientX + 10; // Offset tooltip slightly from the cursor
            const y = event.clientY + 10;
    
            // Prevent tooltip from going off-screen
            const xPos = x + tooltipWidth > window.innerWidth ? x - tooltipWidth - 20 : x;
            const yPos = y + tooltipHeight > window.innerHeight ? y - tooltipHeight - 20 : y;
    
            tooltip.style("left", xPos + "px").style("top", yPos + "px");
        });

        // Mouseout: reset all nodes and edges to their base styles
        inner.selectAll("g.node").on("mouseout", function() {
            tooltip.transition().duration(10).style("opacity", 0); // Hide the tooltip

            // Reset every node: restore filtered fill and remove bold
            inner.selectAll("g.node").each(function(nodeId) {
                d3.select(this).select("rect").style("fill", filteredCourseIds.includes(nodeId) ? "#EEDFCC" : null);
                d3.select(this).select("text").style("font-weight", null);
                d3.select(this).style("opacity", 1);
            });

            // Reset every edge: coreq edges get coral dashed, prereq edges get black solid
            inner.selectAll("g.edgePath").each(function() {
                const svgId = d3.select(this).attr("id") || "";
                const isCoreq = [...coreqEdgeIds].some(edgeId => svgId.includes(edgeId));
                d3.select(this).style("opacity", 1)
                    .select("path")
                    .style("stroke-width", "1.5px")
                    .style("stroke", isCoreq ? "coral" : "black")
                    .style("stroke-dasharray", isCoreq ? "5, 5" : null);
            });
        });
    }

    // Function to update the graph based on selected subjects and themes
    function updateGraph(selectedSubjects, selectedThemes, selectedLevel) {
        // Ensure input arrays are valid
        selectedSubjects = ensureArray(selectedSubjects);
        selectedThemes = ensureArray(selectedThemes);
        selectedLevel = ensureArray(selectedLevel);
    
        // Clear existing graph
        clearGraph();
    
        // Show initial message if no filters are applied
        if (areFiltersEmpty(selectedSubjects, selectedThemes, selectedLevel)) {
            showInitialMessage();
            return;
        }
    
        // Filter courses based on selection criteria
        const filteredCourses = filterCourses(selectedSubjects, selectedThemes, selectedLevel);
    
        // Build graph with filtered courses
        buildGraph(filteredCourses);
    
        // Render the updated graph
        renderGraph(filteredCourses.map(course => course.course_code));
    }
    
    // Helper functions
    
    function ensureArray(input) {
        return Array.isArray(input) ? input : [];
    }
    
    function clearGraph() {
        g.nodes().forEach(node => g.removeNode(node));
        g.edges().forEach(edge => g.removeEdge(edge.v, edge.w));
        coreqEdgeIds.clear();
        d3.select("svg g").remove();
    }
    
    function areFiltersEmpty(subjects, themes, level) {
        return subjects.length === 0 && themes.length === 0 && level.length === 0;
    }
    
    function filterCourses(subjects, themes, level) {
        return coursesData.filter(course =>
            (subjects.length === 0 || subjects.some(subject => course.course_code.startsWith(subject))) &&
            (themes.length === 0 || themes.some(theme => course.themes.includes(theme))) &&
            (level.length === 0 || level.includes(`${course.course_code.charAt(5)}00 level`))
        );
    }
    
    function buildGraph(courses) {
        const addedNodes = new Set();
    
        courses.forEach(course => {
            addNodeIfNotExists(course.course_code, addedNodes);
            
            course.prerequisites.forEach(prereq => {
                addNodeIfNotExists(prereq, addedNodes);
                addEdge(prereq, course.course_code, 'prerequisite');
            });
    
            course.corequisites.forEach(coreq => {
                addNodeIfNotExists(coreq, addedNodes);
                addEdge(coreq, course.course_code, 'corequisite');
            });
        });
    }
    
    function addNodeIfNotExists(nodeId, addedNodes) {
        if (!addedNodes.has(nodeId)) {
            g.setNode(nodeId, { label: nodeId, id: nodeId });
            addedNodes.add(nodeId);
        }
    }
    
    function addEdge(source, target, type) {
        if (type === 'corequisite') coreqEdgeIds.add(`${source}-${target}`);

        const edgeStyle = type === 'corequisite'
            ? { style: "stroke: coral; stroke-dasharray: 5, 5;", arrowheadStyle: "fill: coral" }
            : { arrowheadStyle: "fill: #000" };

        g.setEdge(source, target, {
            label: "",
            id: `${source}-${target}`,
            curve: d3.curveBasis,
            ...edgeStyle
        });
    }

    // Build a reverse map: courseCode -> [{code, type}] so each course can find its dependents.
    function buildDownstreamMap(courses) {
        const map = {};
        courses.forEach(course => {
            course.prerequisites.forEach(prereq => {
                if (!map[prereq]) map[prereq] = [];
                map[prereq].push({ code: course.course_code, type: 'prerequisite' });
            });
            course.corequisites.forEach(coreq => {
                if (!map[coreq]) map[coreq] = [];
                map[coreq].push({ code: course.course_code, type: 'corequisite' });
            });
        });
        return map;
    }

    // Recursively collect every upstream edge (prereqs of prereqs, etc.).
    // Returns [{from, to, type}] for the full ancestor chain.
    function collectUpstreamEdges(courseCode, courses, visited = new Set()) {
        if (visited.has(courseCode)) return [];
        visited.add(courseCode);
        const course = courses.find(c => c.course_code === courseCode);
        if (!course) return [];
        const edges = [];
        course.prerequisites.forEach(prereq => {
            edges.push({ from: prereq, to: courseCode, type: 'prerequisite' });
            collectUpstreamEdges(prereq, courses, visited).forEach(e => edges.push(e));
        });
        course.corequisites.forEach(coreq => {
            edges.push({ from: coreq, to: courseCode, type: 'corequisite' });
            collectUpstreamEdges(coreq, courses, visited).forEach(e => edges.push(e));
        });
        return edges;
    }

    // Recursively collect every downstream edge (courses that need this one, and their dependents).
    // Returns [{from, to, type}] for the full descendant chain.
    function collectDownstreamEdges(courseCode, downstreamMap, visited = new Set()) {
        if (visited.has(courseCode)) return [];
        visited.add(courseCode);
        const edges = [];
        (downstreamMap[courseCode] || []).forEach(({ code, type }) => {
            edges.push({ from: courseCode, to: code, type });
            collectDownstreamEdges(code, downstreamMap, visited).forEach(e => edges.push(e));
        });
        return edges;
    }

    // Function to filter courses based on keywords in the description
    function filterCoursesByKeywords(keywords) {
        if (!keywords) return [];

        const keywordArray = keywords.split(',').map(keyword => keyword.trim().toLowerCase());
        
        return coursesData.filter(course => 
            keywordArray.some(keyword => 
                course.description.toLowerCase().includes(keyword)
            )
        );
    }

    // Add event listener for the search button
    document.getElementById("searchButton").addEventListener('click', function() {
        const keywords = document.getElementById("keywordInput").value.trim(); // Trim whitespace
        if (!keywords) return; // If the input is empty, do nothing

        const filteredCourses = filterCoursesByKeywords(keywords);

        // Clear previous graph nodes and edges
        g.nodes().forEach(node => g.removeNode(node));
        g.edges().forEach(edge => g.removeEdge(edge.v, edge.w));

        // Add filtered courses to the graph
        filteredCourses.forEach(function(course) {
            g.setNode(course.course_code, { label: course.course_code, id: course.course_code });
        });

        filteredCourses.forEach(function(course) {
            if (course.prerequisites.length > 0) {
                course.prerequisites.forEach(function(prereq) {
                    if (filteredCourses.some(c => c.course_code === prereq)) {
                        g.setEdge(prereq, course.course_code, { label: "", curve: d3.curveBasis, arrowheadStyle: "fill: #000" });
                    }
                });
            }
            if (course.corequisites.length > 0) {
                course.corequisites.forEach(function(coreq) {
                    if (filteredCourses.some(c => c.course_code === coreq)) {
                        g.setEdge(coreq, course.course_code, { label: "", style: "stroke: coral; stroke-dasharray: 5, 5;", curve: d3.curveBasis, arrowheadStyle: "fill: coral" });
                    }
                });
            }
        });

        d3.select("svg g").remove(); // Remove previous graph
        renderGraph(); // Render updated graph
    });

    function showInitialMessage() {
        const svg = d3.select("svg");
        // Check if the initial message already exists
        const initialMessage = svg.select("#initialMessage");
        
        if (initialMessage.empty()) {
            // If it doesn't exist, create it
            svg.append("text")
                .attr("id", "initialMessage")
                .attr("x", "50%")                         
                .attr("y", "50%")                         
                .attr("dy", ".35em")                      
                .attr("text-anchor", "middle")           
                .style("font-size", "60px")              
                .style("fill", "#8B8378")                  
                .style("pointer-events", "none")
                .style("font-family", "Arial, sans-serif") // Use a more modern font
                .style("font-weight", "bold") // Make the text bold  
                .style("filter", "url(#text-shadow)")       
                .text("Filter Courses from the sidebar"); 
        } else {
            // If it exists, make it visible
            initialMessage.style("display", "block");
        }
    }    

    // Add event listener for reset button
    document.getElementById("resetButton").addEventListener('click', function() {
        selectedSubjects = []; // Clear selected subjects
        selectedThemes = [];
        selectedLevel = [];
        dropdownButton.textContent = `Select Subjects (0/3)`; // Update button text
        themesDropdownButton.textContent = 'Select Theme'
        levelsDropdownButton.textContent = 'Select Course Level'


        // Uncheck all checkboxes in the dropdown
        const checkboxes = dropdownContent.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = false; // Uncheck each checkbox
        });

         // Uncheck all checkboxes in the dropdown
         const checkboxes_2 = themesDropdownContent.querySelectorAll('input[type="checkbox"]');
         checkboxes_2.forEach(checkbox => {
             checkbox.checked = false; // Uncheck each checkbox
         });

         const checkboxes_3 = levelsDropdownContent.querySelectorAll('input[type="checkbox"]');
         checkboxes_3.forEach(checkbox => {
             checkbox.checked = false; // Uncheck each checkbox
         });
        
        // Clear the input text box
        document.getElementById("keywordInput").value = ""; // Clear input text box

        document.getElementById("dialog").style.display = "none";

        updateGraph(selectedSubjects, selectedThemes, selectedLevel); // Reset graph

        // Show the initial message again
        showInitialMessage(); // Call the function to show the message
    });

    document.getElementById("close-dialog").onclick = function() {
        document.getElementById("dialog").style.display = "none";
    };

}).catch(error => console.error('Error loading the JSON:', error));