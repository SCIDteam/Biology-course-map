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

d3.json('../data/all_courses_py.json').then(coursesData => {

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
    // Tracks the currently frozen (clicked) course node; null means no selection active
    let frozenCourseId = null;
    // Assigned by renderGraph so the sidebar X button can call resetHighlight across scopes
    let _unfreezeSelection = null;
    // Assigned by renderGraph so sidebar course-card buttons can trigger node selection
    let _selectCourse = null;
    // Assigned by renderGraph so the zoom slider can programmatically drive D3 zoom
    let _zoom = null;

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
        var zoom = d3.zoom()
            .scaleExtent([0.1, 3])
            .on("zoom", function(event) {
                inner.attr("transform", event.transform);
                const slider = document.getElementById("zoomSlider");
                const display = document.getElementById("zoomValue");
                if (slider) slider.value = event.transform.k;
                if (display) display.textContent = Math.round(event.transform.k * 100) + '%';
            });
        svg.call(zoom);
        _zoom = zoom;

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

        // Click: freeze/unfreeze — same node toggles off; different node switches selection
        inner.selectAll("g.node").on("click", function(_event, d) {
            const course = coursesData.find(c => c.course_code === d);
            if (!course) return;

            tooltip.transition().duration(10).style("opacity", 0);

            if (frozenCourseId === d) {
                frozenCourseId = null;
                resetHighlight();
                clearCourseInfoSidebar();
            } else {
                frozenCourseId = d;
                applyHighlight(d);
                showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds);
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

        // Mouseover: show tooltip and preview dependency chain (no-op while frozen)
        inner.selectAll("g.node").on("mouseover", function(_event, d) {
            if (frozenCourseId !== null) return;
            const course = coursesData.find(course => course.course_code === d);

            tooltip.transition().duration(10).style("opacity", 1);
            tooltip.html(`
                <div class="title">${course.course_code}</div>
                <div class="body">${styleTooltip(course.course_title, course.description)}</div>
            `);

            applyHighlight(d);
        })
        .on("mousemove", function (event) {
            if (frozenCourseId !== null) return;
            const tooltipWidth = tooltip.node().offsetWidth;
            const tooltipHeight = tooltip.node().offsetHeight;
            const x = event.clientX + 10;
            const y = event.clientY + 10;
            const xPos = x + tooltipWidth > window.innerWidth ? x - tooltipWidth - 20 : x;
            const yPos = y + tooltipHeight > window.innerHeight ? y - tooltipHeight - 20 : y;
            tooltip.style("left", xPos + "px").style("top", yPos + "px");
        });

        // Mouseout: hide tooltip and restore base styles (no-op while frozen)
        inner.selectAll("g.node").on("mouseout", function() {
            if (frozenCourseId !== null) return;
            tooltip.transition().duration(10).style("opacity", 0);
            resetHighlight();
        });

        // Highlight the full dependency chain for a course: dims others, colors upstream/downstream
        function applyHighlight(d) {
            inner.select(`g.node[id="${d}"]`).select("rect").style("fill", filteredCourseIds.includes(d) ? "#EEDFCC" : "cyan");
            inner.select(`g.node[id="${d}"]`).select("text").style("font-weight", "bold");
            inner.select(`g.node[id="${d}"]`).style("opacity", 1);

            inner.selectAll("g.node").filter(n => n !== d).style("opacity", 0.2);
            inner.selectAll("g.edgePath").style("opacity", 0.2);

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
        }

        // Restore all nodes/edges to their unfrozen base styles
        function resetHighlight() {
            inner.selectAll("g.node").each(function(nodeId) {
                d3.select(this).select("rect").style("fill", filteredCourseIds.includes(nodeId) ? "#EEDFCC" : null);
                d3.select(this).select("text").style("font-weight", null);
                d3.select(this).style("opacity", 1);
            });
            inner.selectAll("g.edgePath").each(function() {
                const svgId = d3.select(this).attr("id") || "";
                const isCoreq = [...coreqEdgeIds].some(edgeId => svgId.includes(edgeId));
                d3.select(this).style("opacity", 1)
                    .select("path")
                    .style("stroke-width", "1.5px")
                    .style("stroke", isCoreq ? "coral" : "black")
                    .style("stroke-dasharray", isCoreq ? "5, 5" : null);
            });
        }

        // Expose unfreeze capability so the sidebar X button can reach resetHighlight across scopes
        _unfreezeSelection = function() {
            if (frozenCourseId !== null) {
                frozenCourseId = null;
                resetHighlight();
                clearCourseInfoSidebar();
            }
        };

        // Expose course selection so sidebar card buttons trigger the same flow as node clicks
        _selectCourse = function(courseCode) {
            const course = coursesData.find(c => c.course_code === courseCode);
            if (!course) return;
            frozenCourseId = courseCode;
            applyHighlight(courseCode);
            showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds);
        };
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
        // Reset frozen selection whenever the graph is rebuilt
        frozenCourseId = null;
        _selectCourse = null;
        _zoom = null;
        clearCourseInfoSidebar();
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

    // Populate the "Course Information" sidebar panel with the redesigned card layout
    function showCourseInfoInSidebar(course, downstreamMap, filteredCourseIds) {
        const panel = document.getElementById("course-info-placeholder");

        const id          = course.id || course.course_code || course.code || "Not available";
        const name        = course.name || course.title || course.course_title || "Not available";
        const description = course.description || "Not available";
        const credits     = course.credits || course.units || "Not available";
        const category    = course.category || "Not available";
        const term        = course.term || "Not available";
        const level       = course.level || (course.course_code ? `${course.course_code.charAt(5)}00 level` : "Not available");

        const prereqList  = course.prerequisites || [];
        const coreqList   = course.corequisites  || [];
        // Derive dependent courses from the reverse edge map
        const depList     = (downstreamMap[id]   || []).map(d => d.code);

        // Header background mirrors the selected node color in the graph
        const isFiltered = filteredCourseIds && filteredCourseIds.includes(id);
        const headerBg   = isFiltered ? '#f9f2ea' : '#e3f8f9';

        // Build stacked reference cards for a list of course codes
        function buildCards(codeList, cardClass) {
            if (!codeList.length) return '<p class="ci-empty">None listed.</p>';
            return codeList.map(code => {
                const rel     = coursesData.find(c => c.course_code === code);
                const relName = rel ? (rel.course_title || rel.title || rel.name || '') : '';
                return `<button class="ci-course-card ${cardClass}" data-course-code="${code}">
                    <div class="ci-card-code">${code}</div>
                    ${relName ? `<div class="ci-card-name">${relName}</div>` : ''}
                </button>`;
            }).join('');
        }

        panel.classList.add("filled");
        panel.innerHTML = `
            <div class="ci-header" style="background:${headerBg}">
                <div class="ci-header-content">
                    <div class="ci-code">${id}</div>
                    <div class="ci-name">${name}</div>
                </div>
                <button class="ci-close" id="course-info-close" title="Clear selection">✕</button>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Course Details</div>
                <div class="ci-kv-grid">
                    <span class="ci-key">Level</span><span class="ci-val">${level}</span>
                    <span class="ci-key">Credits</span><span class="ci-val">${credits}</span>
                    <span class="ci-key">Term</span><span class="ci-val">${term}</span>
                    <span class="ci-key">Category</span><span class="ci-val">${category}</span>
                </div>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Description</div>
                <div class="ci-description">${description}</div>
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Prerequisites (${prereqList.length})</div>
                ${buildCards(prereqList, 'ci-card-prereq')}
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Corequisites (${coreqList.length})</div>
                ${buildCards(coreqList, 'ci-card-coreq')}
            </div>

            <div class="ci-section">
                <div class="ci-section-label">Dependent Courses (${depList.length})</div>
                ${buildCards(depList, 'ci-card-dep')}
            </div>
        `;

        // Wire the X button — calls back into renderGraph scope via _unfreezeSelection
        document.getElementById("course-info-close").addEventListener("click", function() {
            if (_unfreezeSelection) _unfreezeSelection();
        });

        // Wire each course card button to trigger the same selection as a graph node click
        panel.querySelectorAll('.ci-course-card[data-course-code]').forEach(btn => {
            btn.addEventListener('click', function() {
                if (_selectCourse) _selectCourse(this.dataset.courseCode);
            });
        });
    }

    // Clear the sidebar panel back to its default placeholder state
    function clearCourseInfoSidebar() {
        const panel = document.getElementById("course-info-placeholder");
        panel.classList.remove("filled");
        panel.textContent = "Click a course to view details.";
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

    // Zoom slider: update D3 zoom transform while preserving current pan position
    document.getElementById("zoomSlider").addEventListener("input", function() {
        if (!_zoom) return;
        const k = +this.value;
        const current = d3.zoomTransform(svg.node());
        svg.call(_zoom.transform, d3.zoomIdentity.translate(current.x, current.y).scale(k));
    });

}).catch(error => console.error('Error loading the JSON:', error));