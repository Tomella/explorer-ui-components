// Include gulp
var gulp = require('gulp');

// Include Our Plugins
var jshint        = require('gulp-jshint');
var sass          = require('gulp-sass');
var concat        = require('gulp-concat');
var concatCss     = require('gulp-concat-css');
var uglify        = require('gulp-uglify');
var rename        = require('gulp-rename');
var templateCache = require('gulp-angular-templatecache');
var addStream     = require('add-stream');

// Lint Task
gulp.task('lint', function() {
    return gulp.src('source/components/**/*.js')
        .pipe(jshint())
        .pipe(jshint.reporter('default'));
});

// Compile Our Sass
// gulp.task('sass', function() {
//     return gulp.src('scss/*.scss')
//         .pipe(sass())
//         .pipe(gulp.dest('css'));
// });

//Concatenate & Minify JS
gulp.task('scripts', function() {
 return gulp.src('source/components/**/*.js')
 	 .pipe(addStream.obj(prepareTemplates()))
     .pipe(concat('ga-explorer-ui-components.js'))
     .pipe(gulp.dest('dist'))
     .pipe(rename('ga-explorer-ui-components.min.js'))
     .pipe(uglify())
     .pipe(gulp.dest('dist'));
});

// Watch Files For Changes
gulp.task('watch', function() {
	// We watch both JS and HTML files.
    gulp.watch('source/components/**/*(*.js|*.html)', ['lint', 'scripts']);
    gulp.watch('source/components/**/*.css', ['concatCss']);
    //gulp.watch('scss/*.scss', ['sass']);
});


gulp.task('concatCss', function () {
  return gulp.src('source/components/**/*.css')
    .pipe(concatCss("ga-explorer-ui-components.css"))
    .pipe(gulp.dest('dist/'));
});

// Default Task
gulp.task('default', ['lint', 'scripts', 'concatCss', 'watch']);

function prepareTemplates() {
   return gulp.src('source/components/**/*.html')
      .pipe(templateCache({root:"components", module:"exp.ui.templates", standalone : true}));
}

