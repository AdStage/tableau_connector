(function() {
    //
    // Connector definition
    //
    var myConnector = tableau.makeConnector();

    myConnector.init = function(initCallback) {
        // STEP 1: Require login - set username to organization id, and password
        // to the token.
        tableau.authType = tableau.authTypeEnum.basic;
        if (tableau.password){
            initCallback();
        }
        else {
            tableau.username = 'ORGANIZATION_ID';
            tableau.password = 'API_TOKEN';
            initCallback();
        }
    };

    // NOTES: The getSchema function defines the columns you want to show up in
    // tableau and what type of data they are add more columns here, order will matter.
    myConnector.getSchema = function(schemaCallback) {
        // NOTES: If you needed to pull data from the form where they click the button
        // you could fetch it here
        var data = tableau.connectionData;

        var cols = [
            // Note that Tableau does not allow IDs containing colons, so we need to strip off
            // the `ga:` prefix here.
            { id: "adDistributionNetwork", alias: "Ad Distribution Network", dataType: tableau.dataTypeEnum.string },
            { id: "adFormat", alias: "Ad Format", dataType: tableau.dataTypeEnum.string },
            { id: "newUsers", alias: "New Users", dataType: tableau.dataTypeEnum.int },
            { id: "bounceRate", alias: "Bounce Rate", dataType: tableau.dataTypeEnum.float },
            { id: "sessions", alias: "Sessions", dataType: tableau.dataTypeEnum.int },
            { id: "goalCompletionsAll", alias: "Goal Completions", dataType: tableau.dataTypeEnum.int },
            { id: "goalConversionRateAll", alias: "Goal Conversion Rate", dataType: tableau.dataTypeEnum.float }
            // STEP 2: add columns as needed
        ];

        var tableInfo = {
            id: "adstage_campaigns",
            columns: cols
        };
        schemaCallback([tableInfo]); // tell tableau about the fields and their types (can have multiple tables)
    };

    myConnector.getData = function(table, doneCallback) {
        if (tableau.password.length == 0) {
            tableau.abortForAuth();
        }

        // This makes it so AJAX calls are authenticated:
        $.ajaxSetup({
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + tableau.password);
                xhr.setRequestHeader('Accept', 'application/json');
            }
        });
        var connectionUrl = "https://platform.adstage.io/api/organizations/" + tableau.username + "/build_report";

        var fields_list = table.tableInfo.columns.map(function(i){
            // Add the `ga:` prefix back here.
            return 'ga:' + i.id;
        });

        // STEP 3: Configure to fit needs
        var report = {
            date_range: "last_month",
            fields: fields_list,
            filters: [{op: "gt", path: "ga:newUsers", value: 0}],
            limit: 50,
            aggregate_by: "day",
            provider: "google_analytics",
            sort_by: "ga:newUsers",
            dimensions: ["ga:adDistributionNetwork", "ga:adFormat"],
            // STEP 4: Google Analytics Direct only supports one view at a time, so update
            // the view ID accordingly here. You can find view IDs in the Google Analytics
            // interface in the account/property/view selector at the top left corner.
            targets: ["/network/google_analytics/profile/VIEW_ID"]
        };

        var APIPromise = makeAPIRequest(table, report, connectionUrl);

        APIPromise.then(function(response) {
            console.log("Success");
            doneCallback();
        }, function(error) {
            console.error(error);
        });
    };

    function processRows(table, data){
        if (data._embedded["adstage:time_series"]) {
            var series = data._embedded["adstage:time_series"];
            var ii, jj;
            var toRet = [];

            // mash the data into an array of objects
            for (ii = 0; ii < series.length; ++ii) {
                var meta = series[ii].meta;
                var list = series[ii].series;
                for (jj = 0; jj < list.length; ++jj) {
                    // STEP 5: add columns as needed
                    var entry = [meta['ga:adDistributionNetwork'],
                                 meta['ga:adFormat'],
                                 (new Date(list[jj].timeframe.start)),
                                 (list[jj].data['ga:newUsers'] || 0),
                                 (list[jj].data['ga:bounceRate'] || 0),
                                 (list[jj].data['ga:sessions'] || 0),
                                 (list[jj].data['ga:goalCompletionsAll'] || 0),
                                 (list[jj].data['ga:goalConversionRateAll'] || 0)];
                    toRet.push(entry);
                }
            }

            table.appendRows(toRet);
        }
    }

    function handleResponse(counter, table, response, resolve, reject){
        processRows(table, response);
        if (response._links.next && counter < 100){
            $.ajax({
                url: response._links.next.href,
                type: "GET",
                contentType: 'application/json',
                dataType: 'json',
                success: function(data){
                    return handleResponse((counter + 1), table, data, resolve, reject);
                },
                error: function(xhr, ajaxOptions, thrownError) {
                    reject("Problem fetching from AdStage data source: " + thrownError);
                }
            });
        } else {
            resolve();
        }
    }

    function makeAPIRequest(table, report, connectionUrl) {
        return new Promise(function(resolve, reject) {
            var xhr = $.ajax({
                url: connectionUrl,
                type: "POST",
                data: JSON.stringify(report),
                contentType: 'application/json',
                dataType: 'json',
                success: function(data){
                    return handleResponse(0, table, data, resolve, reject);
                },
                error: function(xhr, ajaxOptions, thrownError) {
                    reject("Problem fetching from AdStage data source: " + thrownError);
                }
            });
        });
    }

    setupConnector = function() {
        // NOTES: If you needed to set up data to pass from the main page to the connector, set it on connectionData
        tableau.connectionData = null;
        tableau.connectionName = 'AdStage GA Direct Data - Last Month'; // name the data source. This will be the data source name in Tableau
        tableau.submit();
    };

    tableau.registerConnector(myConnector);

    //
    // Setup connector UI
    //
    $(document).ready(function() {
        $("#submitButton").click(function() { // This event fires when a button is clicked
            setupConnector();
        });
        $('#tickerForm').submit(function(event) {
            event.preventDefault();
            setupConnector();
        });
    });
})();
