var directionsDisplay;
var directionsService = new google.maps.DirectionsService();
var map;
var currentRoutePointList;

function PointData(lat, lng, alt, dist, angle)
{
  this.lat = lat;
  this.lng = lng;
  this.alt = alt;
  this.dist = dist;
  this.angle = angle;
}

function initialize()
{
  directionsDisplay = new google.maps.DirectionsRenderer();

  var latlng = new google.maps.LatLng(35.709984,139.810703);

  var opts = {
    zoom: 7,
    center: latlng,
    mapTypeId: google.maps.MapTypeId.ROADMAP
  };

  currentRoutePointList = null;

  map = new google.maps.Map(document.getElementById("map_canvas"), opts);
  directionsDisplay.setMap(map);

/*
  google.maps.event.addListener(
    directionsDisplay,
    'directions_changed',
    function()
    {
    });
*/

  calcRoute();
}


//================================================================
// compute data
//================================================================

function calcRoute()
{
  var start = document.getElementById("start").value;
  var end = document.getElementById("end").value;

  var route = {
    origin: start,
    destination: end,
    travelMode: google.maps.TravelMode.DRIVING
  }

  directionsService.route(
    route,
    function(response, status)
    {
      if(status == google.maps.DirectionsStatus.OK)
      {
        directionsDisplay.setDirections(response);
        
        if(response.routes.length > 0)
        {
          currentRoutePointList = response.routes[0].overview_path;

          //analysis();
          getElevations(currentRoutePointList);	// it calls analysis if succeeded to get info
        }
      }
      else
      {
        currentRouteList = null;
      }
    });
}

function calcDistance(start, end)
{
  var earth_r = 6378.137;
  var diffLatRAD = Math.PI / 180 * (end.lat() - start.lat());
  var diffLonRAD = Math.PI / 180 * (end.lng() - start.lng());

  var distNS = earth_r * diffLatRAD;
  var distEW = Math.cos(Math.PI / 180 * start.lat()) * earth_r * diffLonRAD;

  var horizontalDistance = Math.sqrt(Math.pow(distEW, 2) + Math.pow(distNS, 2));
  horizontalDistance *= 1000;

  //var diffAlt = Math.Abs(currentAlt - prevAlt);
  //var partDistance = Math.sqrt(Math.pow(horizontalDistance, 2) + Math.pow(diffAlt, 2));

  return horizontalDistance;
}

function getElevations(points)
{
  var positionalRequest = {
    'locations': points
  }

  var elevator = new google.maps.ElevationService();
  elevator.getElevationForLocations(positionalRequest, function(results, status)
  {
    var elvs = [];
    if (status == google.maps.ElevationStatus.OK)
    {
      results.forEach(function(result)
      {
        if(result)
        {
          elvs.push(result.elevation);
        }
        else
        {
          elvs.push(0);
        }
      });

      analysis(elvs);
    }
    else
    {
      alert("Elevation service failed due to: " + status);
    }
  });
}

function analysis(elvs)
{
  var maxAlt = 0.0;
  var minAlt = 0.0;
  var maxAngle = 0.0;
  var total = 0.0;
  var climbStartAlt = 0.0;
  var climbDistance = 0.0;
  var maxClimbAlt = 0.0;
  var maxClimbDistance = 0.0;

  var points = [];

  if(currentRoutePointList != null && currentRoutePointList.length > 1 && currentRoutePointList.length == elvs.length)
  {
    var previous = null;
    var prevElv = 0;

    clearTable();

    for(var i=0; i<elvs.length; i++)
    {
      var p = new PointData(0,0,0,0,0);
      var point = currentRoutePointList[i];
      var elv = elvs[i];

      if(previous != null)
      {
        var distance = calcDistance(previous, point);
        var angle = 100 * (elv - prevElv) / distance;
        createTableRecord(i, point, elv, distance, angle);

        // store for graph
        p.dist = distance;
        p.angle = angle;

        // analysis
        total += distance;

        if(maxAngle < angle)
        {
          maxAngle = angle;
        }

        if(maxAlt < elv)
        {
          maxAlt = elv;
        }

        if(minAlt == 0 || minAlt > elv)
        {
          minAlt = elv;
        }

        if(prevElv < elv)
        {
          if(climbStartAlt == 0)
          {
            climbStartAlt = prevElv;
            climbDistance = distance;
          }
          else
          {
            climbDistance += distance;
          }
        }
        else
        {
          if(climbStartAlt != 0)
          {
            var altDiff = prevElv - climbStartAlt;
            if(maxClimbAlt < altDiff)
            {
              maxClimbAlt = altDiff;
              maxClimbDistance = climbDistance;
            }
          }
        }
      }
      
      previous = point;
      prevElv = elv;

      // store for graph
      p.lat = point.lat;
      p.lng = point.lng;
      p.alt = elv;

      points.push(p);
    }

    // results
    createAnalysisTableRecord("総距離", String(myRound(total / 1000, 2)) + " km (" + String(myRound(total, 2)) + " m)");
    createAnalysisTableRecord("高度差", String(myRound(maxAlt - minAlt, 2)) + " m");
    createAnalysisTableRecord("最高傾斜", String(myRound(maxAngle, 2)) + " %");
    createAnalysisTableRecord("最高角度最長傾斜距離（調整中)", String(myRound(maxClimbDistance / 1000, 2)) + " km (" + String(myRound(maxClimbDistance, 2)) + " m)");
    createAnalysisTableRecord("最高角度最長傾斜度（調整中)", String(myRound(100 * maxClimbAlt / maxClimbDistance, 2)) + " %");

    createGraph(points);
  }
  else
  {
    window.alert("invalid data");
  }
  
  //console.log(total);
  //console.log(max);
  //console.log(maxAngle);
}


//================================================================
// create html items (graph)
//================================================================

function createGraph(datalist)
{
  if(datalist != null)
  {
    var $csv = "距離,高度(m),傾斜率(%)\n";
    var totalDist = 0;
    datalist.forEach(function(point){
      totalDist += point.dist;
      $csv += String(myRound(totalDist, 2)) + "," + String(myRound(point.alt, 2)) + "," + String(myRound(point.angle, 2)) + "\n";
    })

    var container = document.getElementById("graph_canvas");
    var g = new Dygraph(container, $csv);
  }
}

//================================================================
// create html items (tables)
//================================================================

function clearTable()
{
  $('table.analysis tbody').html('');
  $('<tr>' +
      '<th>項目</th>' +
      '<th>結果</th>' +
    '</tr>'
  ).appendTo('table.analysis tbody');

  $('table.tbl tbody').html('');
  $('<tr>' +
      '<th>No</th>' +
      '<th>緯度</th>' +
      '<th>経度</th>' +
      '<th>海抜(m)</th>' +
      '<th>距離(m)</th>' +
      '<th>道路勾配(%)</th>' +
    '</tr>'
  ).appendTo('table.tbl tbody');
}

function createTableRecord(no, lnglat, alt, dist, angle)
{
  $('<tr>' +
      '<td style="text-align: left;">' + no + '</th>' +
      '<td style="text-align: left;">' + myRound(lnglat.lat(), 6) + '</td>' +
      '<td style="text-align: left;">' + myRound(lnglat.lng(), 6) + '</td>' +
      '<td style="text-align: right;">' + myRound(alt, 2) + '</td>' +
      '<td style="text-align: right;">' + myRound(dist, 2) + '</td>' +
      '<td style="text-align: right;">' + myRound(angle, 2) + '</td>' +
    '</tr>'
  ).appendTo('table.tbl tbody');
}

function createAnalysisTableRecord(title, value)
{
  $('<tr>' +
      '<td style="text-align: left;">' + title + '</th>' +
      '<td style="text-align: right;">' + value + '</td>' +
    '</tr>'
  ).appendTo('table.analysis tbody');
}


//================================================================
// common utils
//================================================================

function myRound(val, precision)
{
     //小数点を移動させる為の数を10のべき乗で求める
//例) 小数点以下2桁の場合は 100 をかける必要がある
     digit = Math.pow(10, precision);
 
     //四捨五入したい数字に digit を掛けて小数点を移動
     val = val * digit;
 
     //roundを使って四捨五入
     val = Math.round(val);
 
     //移動させた小数点を digit で割ることでもとに戻す
     val = val / digit;
 
     return val;
}