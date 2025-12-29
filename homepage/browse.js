function makeS3Thing(bucket) {
    return function(thing) {
        var splitKey = thing.Key.split('/');
        var keys = splitKey.slice(1,splitKey.length);
        var newThing = {
            id: keys.join('-'),
            keys: keys,
            name: keys[keys.length-1],
            directory: keys[0],
            url: 'https://s3.amazonaws.com/' + bucket + '/' + thing.Key
        };
        return newThing;
    };
}


function group(xs, level) {
    return xs.reduce(function(rv, x) {
        var key = x.keys[level]
        rv[key] = rv[key] || [];
        rv[key].push(x);
        return rv;
    }, {});
}

function makeS3Things(bucket, s3Things, level) {
    var grouped = group(s3Things, level);
    var keys = [];
    for (var key in grouped) {
        keys.push(key);
    }
    for (var i=0; i<keys.length; ++i) {
        var key = keys[i];
        if (grouped[key] && grouped[key][0].keys.length > level+2) {
            subgroups = makeS3Things(bucket, grouped[key], level+1)
            grouped[key] = subgroups
        }
    }
    return grouped;
}

function showElement(event) {
    var button = event.target
    var buttonId = button.getAttribute("id");
    var l = "-button".length;
    var id = buttonId.substring(0,buttonId.length-l);
    var el = document.getElementById(id);
    if (el) {
        var status = el.style.display;
        if (status == "none") {
            el.style.display = "block";
            button.innerHTML = '-';
        } else {
            el.style.display = "none";
            button.innerHTML = '+';
        }
    }
}


function browse(bucket, prefix, divId) {
    var template = '<ul v-bind:id="id" class="hideme">\
   <li v-for="(s3Thing,key) in s3">\
      <span v-if="s3Thing.hasOwnProperty(\'url\')">\
         <a v-bind:href="s3Thing.url" target="_new">{{s3Thing.name}}</a>\
      </span>\
      <span v-else>\
         {{key.replace(/_/g, " ")}}\
         <button onclick="showElement(event)" v-bind:id="id+\'-\'+key+\'-button\'">\
         +\
         </button>\
         <directory v-bind:id="id+\'-\'+key" v-bind:s3="s3Thing"></directory>\
      </span>\
    </li>\
</ul>'
    Vue.component('directory', {
        props: ['s3', 'id'],
        template: template,
    });
    AWS.config.update({
        region: 'us-east-1',
    });
    var s3 = new AWS.S3({
        apiVersion: '2006-03-01',
        params: { Bucket: bucket }
    });
    s3.makeUnauthenticatedRequest(
        'listObjectsV2',
        {Bucket: bucket, Prefix: prefix},
        function(err, s3data) {
            if (err) console.log(err, err.stack)
            else {
                var s3Things = s3data.Contents.map(makeS3Thing(bucket));
                var s3 = makeS3Things(bucket, s3Things, 0)
                //s3Things = s3data.Contents.map(makeS3Thing(bucket))
                new Vue({
                    el: '#app',
                    data: {
                        message: 'Test Message',
                        s3data: s3
                    }
                });
                var nodesToHide = document.getElementsByClassName('hideme');
                for (var i=0; i<nodesToHide.length; ++i) {
                    node = nodesToHide[i];
                    if (node.id && node.id != 'top') {
                        node.style.display = "none";
                    }
                }
            }
        }
    );
}

