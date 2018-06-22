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
            { id: "entity_id", alias: "Entity ID", dataType: tableau.dataTypeEnum.string },
            { id: "campaign_name", alias: "Campaign Name", dataType: tableau.dataTypeEnum.string },
            { id: "network", alias: "Network", dataType: tableau.dataTypeEnum.string },
            { id: "date", alias: "Date", dataType: tableau.dataTypeEnum.date },
            { id: "spend", alias: "Spend", dataType: tableau.dataTypeEnum.float },
            { id: "clicks", alias: "Clicks", dataType: tableau.dataTypeEnum.int },
            { id: "impressions", alias: "Impressions", dataType: tableau.dataTypeEnum.int },
            { id: "conversions", alias: "Conversions", dataType: tableau.dataTypeEnum.int },
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
            return i.id;
        });

        // STEP 3: Configure to fit needs
        var report = {
            date_range: "last_month",
            entity_level: "campaigns",
            fields: fields_list,
            filters: [{op: "gt", path: "impressions", value: 0}],
            limit: 50,
            aggregate_by: "day",
            provider: "facebook",
            // STEP 4: Facebook Direct only supports one account at a time, so update
            // the account ID accordingly here. You can find account IDs here:
            // https://profile.adstage.io/accounts
            targets: ["/network/facebook/account/ACCOUNT_ID"]
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
                    var entry = [meta.entity_id,
                                 meta.campaign_name,
                                 meta.network,
                                 (new Date(list[jj].timeframe.start)),
                                 (list[jj].data.spend || 0),
                                 (list[jj].data.clicks || 0),
                                 (list[jj].data.impressions || 0),
                                 (list[jj].data.conversions || 0)];
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
        tableau.connectionName = 'AdStage Facebook Direct Data - Campaigns Last Month'; // name the data source. This will be the data source name in Tableau
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
